"""米国上場株の「真の歴史的時価総額（年次）」を SEC EDGAR から収集する (SOT-1056 / 子SOT-1064)。

方針 B-3: フロント側の近似（現在時価総額 × 株価比）ではなく、**実データ**で時価総額を作る。

  真の時価総額(year) = その年の年末終値 × その時点で直近に開示された発行済株式数

- 株価（年末終値）は同梱 `backend/data/stock-prices.json`（2000年〜日次）を使用。
- 発行済株式数は SEC EDGAR の XBRL companyconcept から取得する（APIキー不要）:
    us-gaap:CommonStockSharesOutstanding（無ければ dei:EntityCommonStockSharesOutstanding）。
  XBRL 義務化以降のため概ね 2009年前後〜のみ取得できる。**米国上場株のみ**が対象
  （`.T` / `.KS` などのサフィックス付き＝非米国は SEC に CIK が無く対象外）。

出力: `backend/data/market-cap-history.json`
    {
      "_meta": {...},
      "AAPL": {"cik": "0000320193", "name": "Apple Inc.",
               "mcap_yearly": [{"year": 2009, "market_cap": ..., "close": ..., "shares": ...}, ...]},
      ...
    }

実行:
    cd backend && python -m scripts.collect_market_cap_history
    # もしくは
    python backend/scripts/collect_market_cap_history.py

SEC の公正利用ポリシーに従い、識別可能な User-Agent を付与しリクエスト間にスリープを入れる。
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request

# --- 設定 -------------------------------------------------------------------

USER_AGENT = os.environ.get(
    "SEC_USER_AGENT", "stock-signal-research market-cap-collector (sota.moro@gmail.com)"
)
REQUEST_SLEEP = 0.20  # SEC fair-access: <=10 req/s
RETRIES = 3
# XBRL 義務化以降。これより前は発行株式数が SEC から取れないため年次を作らない。
MIN_YEAR = 2009

_HERE = os.path.dirname(os.path.abspath(__file__))
_DATA_DIR = os.path.join(_HERE, "..", "data")
STOCK_PRICES_PATH = os.path.join(_DATA_DIR, "stock-prices.json")
OUT_PATH = os.path.join(_DATA_DIR, "market-cap-history.json")
COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"

# 発行株式数を表す XBRL コンセプト（優先順）。
SHARES_CONCEPTS = [
    ("us-gaap", "CommonStockSharesOutstanding"),
    ("dei", "EntityCommonStockSharesOutstanding"),
]


# --- HTTP ヘルパ（collect_investor_data.py と同パターン） --------------------

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
                return None  # コンセプト未開示などは 404 → 呼び出し側でスキップ
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


# --- ユニバース（対象ティッカー）-------------------------------------------

def is_us_ticker(ticker: str) -> bool:
    """米国上場ティッカー判定。`.T`(東証) `.KS`(韓国) 等のサフィックス付きは非米国として除外。"""
    if not ticker:
        return False
    t = ticker.strip().upper()
    if "." in t:
        return False
    # 念のため: 数字のみ（日本株コード）も除外
    if t.isdigit():
        return False
    return True


def load_universe() -> dict[str, str]:
    """同梱株価データのティッカー→企業名マップから、米国ティッカーのみを返す。"""
    with open(STOCK_PRICES_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    out: dict[str, str] = {}
    for ticker, entry in data.items():
        if ticker == "_meta" or not isinstance(entry, dict):
            continue
        if not is_us_ticker(ticker):
            continue
        out[ticker] = entry.get("name") or ticker
    return out


def load_year_end_closes() -> dict[str, dict[int, tuple[str, float]]]:
    """ティッカー→{year: (date, close)} の年末（その年最終営業日）終値マップ。"""
    with open(STOCK_PRICES_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    out: dict[str, dict[int, tuple[str, float]]] = {}
    for ticker, entry in data.items():
        if ticker == "_meta" or not isinstance(entry, dict):
            continue
        year_close: dict[int, tuple[str, float]] = {}
        for p in entry.get("prices", []):
            d = p.get("date")
            c = p.get("close")
            if not d or c is None:
                continue
            year = int(d[:4])
            # 同じ年の最後（昇順なので上書きでOK）の終値を採用
            prev = year_close.get(year)
            if prev is None or d >= prev[0]:
                year_close[year] = (d, float(c))
        out[ticker] = year_close
    return out


# --- SEC: ticker→CIK と発行株式数 ------------------------------------------

def build_ticker_cik_map() -> dict[str, str]:
    """SEC company_tickers.json から TICKER(大文字)→CIK(10桁ゼロ埋め) を作る。"""
    data = _get_json(COMPANY_TICKERS_URL)
    out: dict[str, str] = {}
    if not data:
        return out
    for _, row in data.items():
        ticker = str(row.get("ticker", "")).upper()
        cik = str(row.get("cik_str", "")).zfill(10)
        if ticker and cik != "0000000000":
            out[ticker] = cik
    return out


def shares_outstanding_series(cik: str) -> list[tuple[str, float]]:
    """CIK の発行株式数時系列を [(end_date, shares)] 昇順で返す。複数コンセプトをマージ。"""
    points: dict[str, float] = {}
    for taxonomy, concept in SHARES_CONCEPTS:
        url = (
            f"https://data.sec.gov/api/xbrl/companyconcept/"
            f"CIK{cik}/{taxonomy}/{concept}.json"
        )
        data = _get_json(url)
        if not data:
            continue
        for unit_vals in (data.get("units") or {}).values():
            for v in unit_vals:
                end = v.get("end")
                val = v.get("val")
                if not end or val is None:
                    continue
                # 同一 end が複数コンセプト/単位にある場合、より大きい(=最新の総数)を残す。
                if end not in points or val > points[end]:
                    points[end] = float(val)
    return sorted(points.items())


def nearest_shares(series: list[tuple[str, float]], as_of_date: str) -> float | None:
    """as_of_date 以前で最も新しい発行株式数。無ければ最古の値（将来日のみのデータ保険）。"""
    if not series:
        return None
    chosen = None
    for end, shares in series:
        if end <= as_of_date:
            chosen = shares
        else:
            break
    if chosen is None:
        chosen = series[0][1]
    return chosen


# --- メイン -----------------------------------------------------------------

def collect() -> dict:
    universe = load_universe()
    closes = load_year_end_closes()
    print(f"対象米国ティッカー: {len(universe)} 件", flush=True)

    print("SEC company_tickers.json を取得中...", flush=True)
    ticker_cik = build_ticker_cik_map()
    print(f"  ticker→CIK マップ: {len(ticker_cik)} 件", flush=True)

    result: dict = {}
    covered = 0
    for i, (ticker, name) in enumerate(sorted(universe.items()), start=1):
        cik = ticker_cik.get(ticker.upper())
        if not cik:
            print(f"[{i}/{len(universe)}] {ticker}: CIK 無し → skip", flush=True)
            continue
        try:
            series = shares_outstanding_series(cik)
        except Exception as e:  # pragma: no cover - ネットワーク防御
            print(f"[{i}/{len(universe)}] {ticker}: SEC取得失敗 {e} → skip", flush=True)
            continue
        if not series:
            print(f"[{i}/{len(universe)}] {ticker}: 発行株式数なし → skip", flush=True)
            continue

        year_close = closes.get(ticker, {})
        mcap_yearly = []
        for year in sorted(year_close):
            if year < MIN_YEAR:
                continue
            end_date, close = year_close[year]
            shares = nearest_shares(series, end_date)
            if shares is None or shares <= 0:
                continue
            mcap_yearly.append({
                "year": year,
                "market_cap": round(close * shares, 2),
                "close": close,
                "shares": shares,
            })
        if not mcap_yearly:
            print(f"[{i}/{len(universe)}] {ticker}: {MIN_YEAR}年以降の年次なし → skip", flush=True)
            continue

        result[ticker] = {"cik": cik, "name": name, "mcap_yearly": mcap_yearly}
        covered += 1
        last = mcap_yearly[-1]
        print(
            f"[{i}/{len(universe)}] {ticker}: {len(mcap_yearly)}年 "
            f"({mcap_yearly[0]['year']}〜{last['year']}, 直近mcap≈{last['market_cap']:.3e})",
            flush=True,
        )

    result["_meta"] = {
        "source": "SEC EDGAR XBRL companyconcept (CommonStockSharesOutstanding / "
                  "EntityCommonStockSharesOutstanding) × bundled stock-prices.json year-end close",
        "approach": "B-3: real historical market cap (price × shares outstanding)",
        "scope": f"US-listed tickers only, years >= {MIN_YEAR} (XBRL era)",
        "collected_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "universe_us_tickers": len(universe),
        "covered_tickers": covered,
        "min_year": MIN_YEAR,
    }
    return result


def main() -> int:
    result = collect()
    os.makedirs(_DATA_DIR, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    meta = result["_meta"]
    print(
        f"\n書き出し完了: {OUT_PATH}\n"
        f"  対象 {meta['universe_us_tickers']} / 収集成功 {meta['covered_tickers']} ティッカー",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
