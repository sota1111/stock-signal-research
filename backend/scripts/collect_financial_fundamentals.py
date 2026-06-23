"""米国上場株の財務ファンダメンタルズ時系列を SEC EDGAR XBRL から収集する (SOT-1121 / 候補D)。

候補D: 売上 / 粗利 / R&D / capex の年次フローを SEC EDGAR の XBRL companyconcept から取得・正規化し、
研究→特許→業績→株価の因果検証を可能にする。`collect_market_cap_history.py` と同じ SEC アクセス
パターン（USER_AGENT 必須・リクエスト間スリープ・404スキップ・リトライ）を流用する。

値の正規化（年次フロー抽出・restatement の重複排除）と concept フォールバックは
`app.services.financial_fundamentals` の純関数を再利用する（=ユニットテスト対象）。

出力: `backend/data/financial-fundamentals.json`
    {
      "_meta": {...},
      "AAPL": {"ticker": "AAPL", "cik": "0000320193", "name": "Apple Inc.", "currency": "USD",
               "metrics": {"revenue": {"concept": "...", "points": [{"year":2020,"value":...,"end":"..."}]},
                           "gross_profit": {...}, "rnd": {...}, "capex": {...}}},
      ...
    }

実行（途中再開・冪等: 既存JSONを読み込み、未収集ティッカーのみ取得して上書き）:
    cd backend && python -m scripts.collect_financial_fundamentals
    SEC_USER_AGENT=... FUND_TICKERS="AAPL,MSFT" python -m scripts.collect_financial_fundamentals
    FUND_MAX_TICKERS=20 python -m scripts.collect_financial_fundamentals
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request

# backend/ を import path に追加（`python backend/scripts/...` でも `app` を解決できるように）。
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from app.services.financial_fundamentals import METRICS, normalize_annual_facts  # noqa: E402

# --- 設定 -------------------------------------------------------------------

USER_AGENT = os.environ.get(
    "SEC_USER_AGENT", "stock-signal-research fundamentals-collector (sota.moro@gmail.com)"
)
REQUEST_SLEEP = 0.20  # SEC fair-access: <=10 req/s
RETRIES = 3

_DATA_DIR = os.path.join(_BACKEND, "data")
STOCK_PRICES_PATH = os.path.join(_DATA_DIR, "stock-prices.json")
OUT_PATH = os.path.join(_DATA_DIR, "financial-fundamentals.json")
COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"

# シード用デフォルト・ユニバース（主要な米国大型・半導体/AI 関連。XBRL を豊富に開示）。
DEFAULT_TICKERS = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "AVGO", "TSLA",
    "AMD", "INTC", "QCOM", "MU", "ORCL", "CRM", "ADBE", "CSCO",
    "IBM", "TXN", "AMAT", "LRCX", "KLAC", "MRVL", "ARM", "NOW",
]


# --- HTTP ヘルパ（collect_market_cap_history.py と同パターン） --------------

def _request(url: str):
    last_err = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity"}
            )
            resp = urllib.request.urlopen(req, timeout=60)
            time.sleep(REQUEST_SLEEP)
            return resp
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 404:
                return None  # 未開示の concept は 404 → 呼び出し側でスキップ
            time.sleep(1.0 + attempt)
        except urllib.error.URLError as e:
            last_err = e
            time.sleep(1.0 + attempt)
    raise RuntimeError(f"request failed after {RETRIES} tries: {url}: {last_err}")


def _get_json(url: str):
    resp = _request(url)
    if resp is None:
        return None
    try:
        return json.load(resp)
    finally:
        resp.close()


# --- ユニバース・CIK --------------------------------------------------------

def is_us_ticker(ticker: str) -> bool:
    if not ticker:
        return False
    t = ticker.strip().upper()
    return "." not in t and not t.isdigit()


def load_universe() -> list[str]:
    """対象ティッカーを決定する。FUND_TICKERS 優先、無ければ DEFAULT_TICKERS。"""
    raw = os.environ.get("FUND_TICKERS", "").strip()
    if raw:
        tickers = [t.strip().upper() for t in raw.split(",") if t.strip()]
    else:
        tickers = list(DEFAULT_TICKERS)
    tickers = [t for t in tickers if is_us_ticker(t)]
    limit = os.environ.get("FUND_MAX_TICKERS")
    if limit:
        try:
            tickers = tickers[: int(limit)]
        except ValueError:
            pass
    return tickers


def build_ticker_maps() -> tuple[dict[str, str], dict[str, str]]:
    """SEC company_tickers.json から TICKER(大文字)→CIK(10桁) と TICKER→社名 を作る。"""
    data = _get_json(COMPANY_TICKERS_URL)
    cik_map: dict[str, str] = {}
    name_map: dict[str, str] = {}
    if not data:
        return cik_map, name_map
    for _, row in data.items():
        ticker = str(row.get("ticker", "")).upper()
        cik = str(row.get("cik_str", "")).zfill(10)
        if ticker and cik != "0000000000":
            cik_map[ticker] = cik
            name_map[ticker] = str(row.get("title") or ticker)
    return cik_map, name_map


def fetch_concept_units(cik: str, taxonomy: str, concept: str):
    """companyconcept の `units` dict を返す（404/未開示は None）。"""
    url = (
        f"https://data.sec.gov/api/xbrl/companyconcept/"
        f"CIK{cik}/{taxonomy}/{concept}.json"
    )
    data = _get_json(url)
    if not data:
        return None
    return data.get("units")


def collect_company_metrics(cik: str) -> dict:
    """1社の全指標を収集。{metric: {"concept": str, "points": [...]}} を返す。

    concept はフォールバック順に試し、最初に年次データが取れた時点で打ち切る（短絡）。
    無駄な SEC リクエストを避けて収集を高速化する。"""
    metrics: dict = {}
    for metric_key, concept_list in METRICS:
        for taxonomy, concept in concept_list:
            units = fetch_concept_units(cik, taxonomy, concept)
            if not units:
                continue
            series = normalize_annual_facts(units)
            if series:
                metrics[metric_key] = {"concept": f"{taxonomy}:{concept}", "points": series}
                break
    return metrics


# --- メイン -----------------------------------------------------------------

def load_existing() -> dict:
    try:
        with open(OUT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return {}


def collect() -> dict:
    universe = load_universe()
    print(f"対象ティッカー: {len(universe)} 件", flush=True)

    print("SEC company_tickers.json を取得中...", flush=True)
    cik_map, name_map = build_ticker_maps()
    print(f"  ticker→CIK マップ: {len(cik_map)} 件", flush=True)

    result = load_existing()  # 途中再開: 既存を保持
    if "_meta" in result:
        del result["_meta"]

    covered = 0
    for i, ticker in enumerate(universe, start=1):
        cik = cik_map.get(ticker)
        if not cik:
            print(f"[{i}/{len(universe)}] {ticker}: CIK 無し → skip", flush=True)
            continue
        # 既に指標を収集済みなら冪等にスキップ（再開）。
        existing = result.get(ticker)
        if isinstance(existing, dict) and existing.get("metrics"):
            covered += 1
            print(f"[{i}/{len(universe)}] {ticker}: 既収集 → skip", flush=True)
            continue
        try:
            metrics = collect_company_metrics(cik)
        except Exception as e:  # pragma: no cover - ネットワーク防御
            print(f"[{i}/{len(universe)}] {ticker}: SEC取得失敗 {e} → skip", flush=True)
            continue
        if not metrics:
            print(f"[{i}/{len(universe)}] {ticker}: 指標なし → skip", flush=True)
            continue
        result[ticker] = {
            "ticker": ticker,
            "cik": cik,
            "name": name_map.get(ticker, ticker),
            "currency": "USD",
            "metrics": metrics,
        }
        covered += 1
        got = ", ".join(f"{k}:{len(v['points'])}y" for k, v in metrics.items())
        print(f"[{i}/{len(universe)}] {ticker}: {got}", flush=True)

    result["_meta"] = {
        "source": "SEC EDGAR XBRL companyconcept (us-gaap revenue/gross_profit/R&D/capex, annual flow)",
        "approach": "候補D: financial fundamentals time series; concept差異はフォールバックで解決",
        "scope": "US-listed tickers only (XBRL era)",
        "collected_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "covered_tickers": covered,
        "metrics": [m[0] for m in METRICS],
    }
    return result


def main() -> int:
    result = collect()
    os.makedirs(_DATA_DIR, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    meta = result["_meta"]
    print(
        f"\n書き出し完了: {OUT_PATH}\n  収集成功 {meta['covered_tickers']} ティッカー",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
