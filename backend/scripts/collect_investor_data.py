"""主要機関投資家の保有情報(実データ)を SEC EDGAR 13F から収集するスクリプト (SOT-965)。

これまで `seed.py` の機関投資家データは 2024-09-30 単一日付のハードコード3件(合成)だった。
本スクリプトは主要な機関投資家(Vanguard / BlackRock / State Street / Geode / FMR)の
**13F-HR(Form 13F Information Table)** を SEC EDGAR から取得し、当プロジェクトが追跡する
半導体・メモリ関連企業(NVIDIA / AMD / Micron / TSMC ADR)の保有を**過去約10年・年次**で抽出して
`backend/data/collected-investors.json` に書き出す。`seed.py` はこのJSONが存在すれば実データを、
無ければ従来の合成データ(オフライン/テスト用フォールバック)を使う。

実行:
    cd backend && python -m scripts.collect_investor_data
    # もしくは
    python backend/scripts/collect_investor_data.py

外部APIキーは不要(SEC EDGAR の公開エンドポイントを利用)。SEC の公正利用ポリシーに従い、
User-Agent を付与しリクエスト間にスリープを入れる。投資助言ではなく、調査・仮説検証用の
公開開示データとして扱う。
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

# --- 設定 -------------------------------------------------------------------

# SEC は識別可能な User-Agent を要求する(連絡先付き)。
USER_AGENT = os.environ.get(
    "SEC_USER_AGENT", "stock-signal-research investor-collector (sota.moro@gmail.com)"
)
REQUEST_SLEEP = 0.25  # SEC fair-access: <=10 req/s
RETRIES = 3
YEARS_BACK = 10

# 主要機関投資家(マネージャー): (CIK 10桁ゼロ埋め, 表示名)
MANAGERS = [
    ("0000102909", "Vanguard Group"),
    ("0001364742", "BlackRock"),
    ("0000093751", "State Street"),
    ("0001214717", "Geode Capital Management"),
    ("0000315066", "FMR (Fidelity)"),
]

# 追跡対象企業: CUSIP -> 企業情報。company_name は seed.py の Company.name と一致させる。
# sec_cik は発行体の SEC CIK(発行済株式数から保有比率を概算するため)。
TARGET_COMPANIES = {
    "67066G104": {"name": "NVIDIA", "ticker": "NVDA", "sec_cik": "0001045810"},
    "007903107": {"name": "AMD", "ticker": "AMD", "sec_cik": "0000002488"},
    "595112103": {"name": "Micron", "ticker": "MU", "sec_cik": "0000723125"},
    "874039100": {"name": "TSMC", "ticker": "TSM", "sec_cik": "0001046179"},
}

_INFOTABLE_NS_LOCAL = "infoTable"  # 名前空間は localname で判定する

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "collected-investors.json")


# --- HTTP ヘルパ ------------------------------------------------------------

def _request(url: str):
    """URL を開いて file-like を返す(リトライ付き)。呼び出し側が close する。"""
    last_err = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity"})
            resp = urllib.request.urlopen(req, timeout=60)
            time.sleep(REQUEST_SLEEP)
            return resp
        except (urllib.error.URLError, urllib.error.HTTPError) as e:
            last_err = e
            time.sleep(1.0 + attempt)
    raise RuntimeError(f"request failed after {RETRIES} tries: {url}: {last_err}")


def _get_json(url: str):
    resp = _request(url)
    try:
        return json.load(resp)
    finally:
        resp.close()


# --- SEC EDGAR アクセス -----------------------------------------------------

def list_13f_filings(cik: str) -> list[dict]:
    """CIK の全 13F-HR filing を [{accession, report_date}] で返す(古いページも辿る)。"""
    base = f"https://data.sec.gov/submissions/CIK{cik}.json"
    data = _get_json(base)
    out: list[dict] = []

    def _collect(recent: dict):
        forms = recent.get("form", [])
        accs = recent.get("accessionNumber", [])
        dates = recent.get("reportDate", [])
        for i, form in enumerate(forms):
            if form == "13F-HR":
                out.append({"accession": accs[i], "report_date": dates[i]})

    _collect(data["filings"]["recent"])
    for f in data["filings"].get("files", []):
        page = _get_json(f"https://data.sec.gov/submissions/{f['name']}")
        # 旧ページは {"form":[...], ...} のフラット構造
        _collect(page)
    return out


def select_annual(filings: list[dict], years_back: int) -> list[dict]:
    """各年の年末(12-31)報告を優先し、過去 years_back 年分 + 最新1件を選ぶ。"""
    cutoff = (dt.date.today() - dt.timedelta(days=365 * years_back + 31)).isoformat()
    recent = [f for f in filings if f["report_date"] and f["report_date"] >= cutoff]
    chosen: dict[str, dict] = {}
    for f in recent:
        rd = f["report_date"]
        year = rd[:4]
        if rd.endswith("-12-31"):
            chosen[year] = f
    # 直近の四半期(年末でなくても)も含めて最新状況を反映
    if recent:
        latest = max(recent, key=lambda x: x["report_date"])
        chosen.setdefault("latest:" + latest["report_date"], latest)
    return sorted(chosen.values(), key=lambda x: x["report_date"])


def find_info_table_url(cik: str, accession: str) -> str | None:
    cik_int = int(cik)
    acc_nodash = accession.replace("-", "")
    idx = _get_json(
        f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_nodash}/index.json"
    )
    candidates = []
    for it in idx["directory"]["item"]:
        name = it["name"]
        if name.lower().endswith(".xml") and "primary_doc" not in name.lower():
            candidates.append((int(it.get("size", 0)), name))
    if not candidates:
        return None
    candidates.sort(reverse=True)  # 最大の XML を情報テーブルとみなす
    name = candidates[0][1]
    return f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_nodash}/{name}"


def parse_holdings(info_table_url: str, target_cusips: set[str]) -> dict[str, dict]:
    """情報テーブルXMLをストリーム解析し、対象CUSIPの (shares, value) を合算して返す。"""
    agg: dict[str, dict] = {c: {"shares": 0, "value": 0} for c in target_cusips}
    resp = _request(info_table_url)
    try:
        cur = {}
        for event, elem in ET.iterparse(resp, events=("end",)):
            tag = elem.tag.split("}")[-1]
            if tag == "cusip":
                cur["cusip"] = (elem.text or "").strip().upper()
            elif tag == "value":
                cur["value"] = (elem.text or "0").strip()
            elif tag == "sshPrnamt":
                cur["shares"] = (elem.text or "0").strip()
            elif tag == _INFOTABLE_NS_LOCAL:
                cusip = cur.get("cusip", "")
                if cusip in agg:
                    try:
                        agg[cusip]["shares"] += int(float(cur.get("shares", "0")))
                        agg[cusip]["value"] += int(float(cur.get("value", "0")))
                    except (ValueError, TypeError):
                        pass
                cur = {}
                elem.clear()
    finally:
        resp.close()
    return {c: v for c, v in agg.items() if v["shares"] > 0 or v["value"] > 0}


def shares_outstanding_series(sec_cik: str) -> list[tuple[str, float]]:
    """発行体の発行済株式数の時系列 [(end_date, value)] を取得(best-effort)。"""
    url = (
        f"https://data.sec.gov/api/xbrl/companyconcept/CIK{sec_cik}/dei/"
        "EntityCommonStockSharesOutstanding.json"
    )
    try:
        data = _get_json(url)
    except Exception:
        return []
    pts = []
    for unit_vals in data.get("units", {}).values():
        for row in unit_vals:
            end = row.get("end")
            val = row.get("val")
            if end and val:
                pts.append((end, float(val)))
    pts.sort()
    return pts


def nearest_shares_outstanding(series: list[tuple[str, float]], report_date: str) -> float | None:
    """report_date 以前で最も近い発行済株式数を返す。"""
    best = None
    for end, val in series:
        if end <= report_date:
            best = val
        else:
            break
    return best


# --- メイン -----------------------------------------------------------------

def collect() -> list[dict]:
    target_cusips = set(TARGET_COMPANIES.keys())
    # 企業ごとの発行済株式数時系列(保有比率の概算に使用)
    so_series = {}
    for cusip, info in TARGET_COMPANIES.items():
        print(f"  発行済株式数を取得: {info['name']}", flush=True)
        so_series[cusip] = shares_outstanding_series(info["sec_cik"])

    # (manager, cusip) -> 時系列 [{report_date, shares, value}]
    rows: list[dict] = []
    for cik, manager_name in MANAGERS:
        print(f"[{manager_name}] CIK {cik} の 13F を収集中...", flush=True)
        try:
            filings = list_13f_filings(cik)
        except Exception as e:  # noqa: BLE001
            print(f"  ! filings 取得失敗: {e}", flush=True)
            continue
        selected = select_annual(filings, YEARS_BACK)
        print(f"  対象 filing 数: {len(selected)} (全13F-HR {len(filings)})", flush=True)
        # manager 内で cusip ごとに時系列を蓄積し、後で前回比を計算
        series: dict[str, list[dict]] = {c: [] for c in target_cusips}
        for f in selected:
            try:
                url = find_info_table_url(cik, f["accession"])
                if not url:
                    continue
                holdings = parse_holdings(url, target_cusips)
            except Exception as e:  # noqa: BLE001
                print(f"  ! {f['report_date']} 解析失敗: {e}", flush=True)
                continue
            rd = f["report_date"]
            # 2023-01-01 より前の期は value が千ドル単位 → ドルへ正規化
            value_mult = 1000 if rd < "2023-01-01" else 1
            for cusip, agg in holdings.items():
                series[cusip].append(
                    {
                        "report_date": rd,
                        "shares": agg["shares"],
                        "value": agg["value"] * value_mult,
                    }
                )
        # 前回比(change_pct)・保有比率(ownership_pct)を付与して row 化
        for cusip, pts in series.items():
            pts.sort(key=lambda x: x["report_date"])
            info = TARGET_COMPANIES[cusip]
            prev_shares = None
            for p in pts:
                shares = p["shares"]
                value = p["value"]
                change_pct = 0.0
                if prev_shares and prev_shares > 0:
                    change_pct = round((shares - prev_shares) / prev_shares * 100, 2)
                prev_shares = shares
                so = nearest_shares_outstanding(so_series.get(cusip, []), p["report_date"])
                ownership_pct = round(shares / so * 100, 4) if so else 0.0
                rows.append(
                    {
                        "investor_name": manager_name,
                        "company_name": info["name"],
                        "ticker": info["ticker"],
                        "cusip": cusip,
                        "report_date": p["report_date"],
                        "report_type": "13F",
                        "shares": shares,
                        "value_usd": value,
                        "ownership_pct": ownership_pct,
                        "change_pct": change_pct,
                        "notes": f"保有 {shares:,}株 / 評価額 ${value:,.0f}",
                    }
                )
    rows.sort(key=lambda r: (r["investor_name"], r["company_name"], r["report_date"]))
    return rows


def main():
    print(f"SEC EDGAR から機関投資家(13F)実データを収集します(過去{YEARS_BACK}年・年次)", flush=True)
    rows = collect()
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fp:
        json.dump(rows, fp, ensure_ascii=False, indent=2)
    investors = sorted({r["investor_name"] for r in rows})
    companies = sorted({r["company_name"] for r in rows})
    dates = sorted({r["report_date"] for r in rows})
    print(f"\n書き出し: {OUT_PATH}", flush=True)
    print(f"  レコード数: {len(rows)}", flush=True)
    print(f"  投資家: {investors}", flush=True)
    print(f"  企業: {companies}", flush=True)
    print(f"  期間: {dates[0]} 〜 {dates[-1]}" if dates else "  (データなし)", flush=True)


if __name__ == "__main__":
    sys.exit(main())
