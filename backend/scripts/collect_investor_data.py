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
# CIK は SEC EDGAR submissions エンドポイントで 13F-HR を提出する filer であることを確認済み。
# SOT-1177: 大手 13F filer を追加し、投資家ページに表示される投資家を拡充する。
MANAGERS = [
    ("0000102909", "Vanguard Group"),
    ("0001364742", "BlackRock"),
    ("0000093751", "State Street"),
    ("0001214717", "Geode Capital Management"),
    ("0000315066", "FMR (Fidelity)"),
    ("0000895421", "Morgan Stanley"),
    ("0000019617", "JPMorgan Chase"),
    ("0000886982", "Goldman Sachs"),
    ("0000902219", "Wellington Management"),
    ("0000070858", "Bank of America"),
    # SOT-1454: 機関投資家を10→30社に拡張。以下の20社はSEC EDGARで13F-HR filer かつ
    # 追跡対象銘柄の保有を最新四半期(2026-03-31)で検証済み。
    ("0000073124", "Northern Trust"),
    ("0000080255", "T. Rowe Price"),
    ("0000914208", "Invesco"),
    ("0000038777", "Franklin Resources"),
    ("0000354204", "Dimensional Fund Advisors"),
    ("0001109448", "AllianceBernstein"),
    ("0000072971", "Wells Fargo"),
    ("0001390777", "Bank of New York Mellon"),
    ("0000948046", "Deutsche Bank"),
    ("0000820027", "Ameriprise Financial"),
    ("0001163653", "Nomura Holdings"),
    ("0000713676", "PNC Financial Services"),
    ("0000036104", "U.S. Bancorp"),
    ("0000720005", "Raymond James Financial"),
    ("0001137774", "Prudential Financial"),
    ("0001037389", "Renaissance Technologies"),
    ("0001179392", "Two Sigma Investments"),
    ("0001273087", "Millennium Management"),
    ("0001423053", "Citadel Advisors"),
    ("0001167557", "AQR Capital Management"),
    # SOT-1458: 機関投資家を30→100社に拡張。以下の70社はSEC EDGARで 13F-HR filer かつ
    # 追跡対象銘柄を最新四半期の 13F で実際に保有していることを検証済み(捏造なし)。
    # CIK は browse-edgar (type=13F-HR) で名称から解決し、最新 filing の保有明細に
    # 追跡21銘柄のいずれかが含まれることを確認した投資家のみ採用している。
    ("0001374170", "Norges Bank"),
    ("0000884546", "Charles Schwab Investment Management"),
    ("0001422849", "Capital World Investors"),
    ("0001422848", "Capital Research Global Investors"),
    ("0000850529", "Fisher Asset Management"),
    ("0000053417", "Jennison Associates"),
    ("0001997405", "TIAA"),
    ("0001126328", "Principal Financial Group"),
    ("0001274173", "Janus Henderson Group"),
    ("0001330387", "Amundi"),
    ("0000764068", "Legal & General Group"),
    ("0001610520", "UBS Group"),
    ("0000312069", "Barclays"),
    ("0000873630", "HSBC Holdings"),
    ("0000947263", "Toronto Dominion Bank"),
    ("0001694895", "Mitsubishi UFJ"),
    ("0001411530", "Sumitomo Mitsui"),
    ("0000919079", "California Public Employees Retirement System"),
    ("0001081019", "California State Teachers Retirement System"),
    ("0000810265", "New York State Common Retirement Fund"),
    ("0000796848", "Teacher Retirement System of Texas"),
    ("0000854157", "State of Wisconsin Investment Board"),
    ("0000937567", "Ontario Teachers Pension Plan"),
    ("0001283718", "Canada Pension Plan Investment Board"),
    ("0001582202", "Swiss National Bank"),
    ("0001434819", "APG Asset Management"),
    ("0001465109", "Neuberger Berman Group"),
    ("0001056288", "Federated Hermes"),
    ("0001040188", "Victory Capital Management"),
    ("0001125816", "First Trust Advisors"),
    ("0000312348", "Loomis Sayles"),
    ("0001644956", "William Blair Investment Management"),
    ("0000813917", "Harris Associates"),
    ("0000200217", "Dodge & Cox"),
    ("0000763212", "Primecap Management"),
    ("0001020066", "Sands Capital Management"),
    ("0001697748", "ARK Investment Management"),
    ("0000003520", "Fred Alger Management"),
    ("0001009207", "D. E. Shaw"),
    ("0001350694", "Bridgewater Associates"),
    ("0001603466", "Point72 Asset Management"),
    ("0001135730", "Coatue Management"),
    ("0001061165", "Lone Pine Capital"),
    ("0001103804", "Viking Global Investors"),
    ("0001167483", "Tiger Global Management"),
    ("0001088875", "Baillie Gifford"),
    ("0001446194", "Susquehanna International Group"),
    ("0001318757", "Marshall Wace"),
    ("0001165408", "Adage Capital Partners"),
    ("0001387322", "Whale Rock Capital Management"),
    ("0001230239", "Alkeon Capital Management"),
    ("0001541617", "Altimeter Capital Management"),
    ("0001029160", "Soros Fund Management"),
    ("0001040273", "Third Point"),
    ("0001791786", "Elliott Investment Management"),
    ("0001054587", "Sculptor Capital"),
    ("0000923093", "Tudor Investment"),
    ("0000934639", "Maverick Capital"),
    ("0001581811", "Egerton Capital"),
    ("0001569049", "Light Street Capital Management"),
    ("0001055964", "Nomura Asset Management"),
    ("0001529735", "MetLife"),
    ("0000898419", "Prudential PLC"),
    ("0001140022", "Aviva"),
    ("0000898427", "AXA"),
    ("0001535323", "Allianz Asset Management"),
    ("0001068837", "Voya Investment Management"),
    ("0001352526", "Hartford Financial"),
    ("0001789219", "Charles Schwab"),
    ("0000882928", "TIAA-CREF"),
]

# 追跡対象企業(SOT-1120: 主要テーマ銘柄へ拡大)。name は seed.py の Company.name と一致させる。
# 13F のCUSIPは再法人化等で変わりうるため、CUSIP一致 **または** nameOfIssuer のキーワード一致で
# 名寄せする(name_kw は小文字・正規化後の部分一致)。sec_cik は発行体CIK(発行済株式数→保有比率の概算)。
# cusip/ticker は出力の代表値として用いる。米国13Fに現れない海外現地上場(韓国/日本)は対象外。
TARGET_COMPANIES = [
    {"name": "NVIDIA", "ticker": "NVDA", "cusips": ["67066G104"], "name_kw": "nvidia", "sec_cik": "0001045810"},
    {"name": "AMD", "ticker": "AMD", "cusips": ["007903107"], "name_kw": "advanced micro", "sec_cik": "0000002488"},
    {"name": "Micron", "ticker": "MU", "cusips": ["595112103"], "name_kw": "micron", "sec_cik": "0000723125"},
    {"name": "TSMC", "ticker": "TSM", "cusips": ["874039100"], "name_kw": "taiwan semiconduct", "sec_cik": "0001046179"},
    {"name": "Intel", "ticker": "INTC", "cusips": ["458140100"], "name_kw": "intel corp", "sec_cik": "0000050863"},
    {"name": "Broadcom", "ticker": "AVGO", "cusips": ["11135F101"], "name_kw": "broadcom", "sec_cik": "0001730168"},
    {"name": "Qualcomm", "ticker": "QCOM", "cusips": ["747525103"], "name_kw": "qualcomm", "sec_cik": "0000804328"},
    {"name": "Texas Instruments", "ticker": "TXN", "cusips": ["882508104"], "name_kw": "texas instrument", "sec_cik": "0000097476"},
    {"name": "Applied Materials", "ticker": "AMAT", "cusips": ["038222105"], "name_kw": "applied material", "sec_cik": "0000006951"},
    {"name": "Lam Research", "ticker": "LRCX", "cusips": ["512807108"], "name_kw": "lam research", "sec_cik": "0000707549"},
    {"name": "KLA", "ticker": "KLAC", "cusips": ["482480100"], "name_kw": "kla corp", "sec_cik": "0000319201"},
    {"name": "Marvell", "ticker": "MRVL", "cusips": ["573874104"], "name_kw": "marvell", "sec_cik": "0001835632"},
    {"name": "ON Semiconductor", "ticker": "ON", "cusips": ["682189105"], "name_kw": "on semiconductor", "sec_cik": "0001097864"},
    {"name": "Western Digital", "ticker": "WDC", "cusips": ["958102105"], "name_kw": "western digital", "sec_cik": "0000106040"},
    {"name": "Arista Networks", "ticker": "ANET", "cusips": ["040413106"], "name_kw": "arista", "sec_cik": "0001596532"},
    {"name": "Vertiv", "ticker": "VRT", "cusips": ["92537N108"], "name_kw": "vertiv", "sec_cik": "0001674101"},
    {"name": "Tesla", "ticker": "TSLA", "cusips": ["88160R101"], "name_kw": "tesla", "sec_cik": "0001318605"},
    {"name": "ASML", "ticker": "ASML", "cusips": ["N07059210"], "name_kw": "asml", "sec_cik": "0000937966"},
    {"name": "STMicroelectronics", "ticker": "STM", "cusips": ["861012102"], "name_kw": "stmicro", "sec_cik": "0000932787"},
    {"name": "Arm Holdings", "ticker": "ARM", "cusips": ["042068205"], "name_kw": "arm holdings", "sec_cik": "0001973239"},
    {"name": "Super Micro Computer", "ticker": "SMCI", "cusips": ["86800U104"], "name_kw": "super micro", "sec_cik": "0001375365"},
]


def _normalize_name(name: str) -> str:
    """nameOfIssuer を比較用に正規化(小文字化・余分な空白圧縮)。"""
    return " ".join((name or "").lower().split())


def match_company(cusip: str, issuer_name: str, targets=None) -> str | None:
    """13F の1明細(cusip + nameOfIssuer)を対象企業に名寄せし、企業名(=company key)を返す。
    CUSIP一致を優先し、無ければ nameOfIssuer のキーワード部分一致で判定する。該当なしは None。"""
    if targets is None:
        targets = TARGET_COMPANIES
    cusip = (cusip or "").strip().upper()
    norm = _normalize_name(issuer_name)
    for c in targets:
        if cusip and cusip in {x.upper() for x in c.get("cusips", [])}:
            return c["name"]
    for c in targets:
        kw = c.get("name_kw")
        if kw and kw in norm:
            return c["name"]
    return None


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


def parse_holdings(info_table_url: str, targets=None) -> dict[str, dict]:
    """情報テーブルXMLをストリーム解析し、対象企業ごとに (shares, value) を合算して返す。

    SOT-1120: 明細を CUSIP **または** nameOfIssuer キーワードで対象企業に名寄せし、企業名
    (=company key)単位で集約する。値は {company_name: {shares, value, cusip}}。`targets` は
    対象企業定義のリスト(既定は TARGET_COMPANIES)。後方互換のため CUSIP の集合を渡しても、
    その CUSIP を name_kw 無しの最小定義として扱う。"""
    if targets is None:
        targets = TARGET_COMPANIES
    elif isinstance(targets, (set, frozenset)):
        # 後方互換: CUSIP集合を {name=cusip, cusips=[cusip]} として扱う。
        targets = [{"name": c, "cusips": [c], "name_kw": None} for c in targets]

    agg: dict[str, dict] = {}
    resp = _request(info_table_url)
    try:
        cur = {}
        for event, elem in ET.iterparse(resp, events=("end",)):
            tag = elem.tag.split("}")[-1]
            if tag == "cusip":
                cur["cusip"] = (elem.text or "").strip().upper()
            elif tag == "nameOfIssuer":
                cur["name"] = (elem.text or "").strip()
            elif tag == "value":
                cur["value"] = (elem.text or "0").strip()
            elif tag == "sshPrnamt":
                cur["shares"] = (elem.text or "0").strip()
            elif tag == _INFOTABLE_NS_LOCAL:
                company = match_company(cur.get("cusip", ""), cur.get("name", ""), targets)
                if company is not None:
                    bucket = agg.setdefault(company, {"shares": 0, "value": 0, "cusip": cur.get("cusip", "")})
                    try:
                        bucket["shares"] += int(float(cur.get("shares", "0")))
                        bucket["value"] += int(float(cur.get("value", "0")))
                        if cur.get("cusip"):
                            bucket["cusip"] = cur["cusip"]
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

def compute_period_changes(points: list[dict]) -> None:
    """同一(投資家×企業)の四半期時系列に前期比を付与する(純粋関数, ネットワーク非依存)。

    `points` は `{report_date, shares, ...}` のリスト。report_date昇順にソートしたうえで各要素へ:
      - `change_pct`: 前期比の保有株数の%変化(前期が無い/0なら0.0)
      - `quarter_delta`: 前期比の保有株数の符号付き整数差分(前期が無ければ0)
    を in-place で追加する。SOT-1120。"""
    points.sort(key=lambda x: x["report_date"])
    prev_shares = None
    for p in points:
        shares = p["shares"]
        if prev_shares is None:
            p["change_pct"] = 0.0
            p["quarter_delta"] = 0
        else:
            p["quarter_delta"] = int(shares - prev_shares)
            p["change_pct"] = round((shares - prev_shares) / prev_shares * 100, 2) if prev_shares > 0 else 0.0
        prev_shares = shares


def collect() -> list[dict]:
    # 企業ごとの発行済株式数時系列(保有比率の概算に使用)。company name をキーにする。
    so_series: dict[str, list[tuple[str, float]]] = {}
    info_by_name = {c["name"]: c for c in TARGET_COMPANIES}
    for c in TARGET_COMPANIES:
        print(f"  発行済株式数を取得: {c['name']}", flush=True)
        so_series[c["name"]] = shares_outstanding_series(c["sec_cik"])

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
        # manager 内で company name ごとに時系列を蓄積し、後で前回比/四半期deltaを計算
        series: dict[str, list[dict]] = {c["name"]: [] for c in TARGET_COMPANIES}
        for f in selected:
            try:
                url = find_info_table_url(cik, f["accession"])
                if not url:
                    continue
                holdings = parse_holdings(url, TARGET_COMPANIES)
            except Exception as e:  # noqa: BLE001
                print(f"  ! {f['report_date']} 解析失敗: {e}", flush=True)
                continue
            rd = f["report_date"]
            # 2023-01-01 より前の期は value が千ドル単位 → ドルへ正規化
            value_mult = 1000 if rd < "2023-01-01" else 1
            for company_name, agg in holdings.items():
                series[company_name].append(
                    {
                        "report_date": rd,
                        "shares": agg["shares"],
                        "value": agg["value"] * value_mult,
                        "cusip": agg.get("cusip"),
                    }
                )
        # 前回比(change_pct)・四半期delta・保有比率(ownership_pct)を付与して row 化
        for company_name, pts in series.items():
            compute_period_changes(pts)
            info = info_by_name[company_name]
            for p in pts:
                shares = p["shares"]
                value = p["value"]
                so = nearest_shares_outstanding(so_series.get(company_name, []), p["report_date"])
                ownership_pct = round(shares / so * 100, 4) if so else 0.0
                rows.append(
                    {
                        "investor_name": manager_name,
                        "company_name": info["name"],
                        "ticker": info["ticker"],
                        "cusip": p.get("cusip") or (info["cusips"][0] if info.get("cusips") else None),
                        "report_date": p["report_date"],
                        "report_type": "13F",
                        "shares": shares,
                        "value_usd": value,
                        "ownership_pct": ownership_pct,
                        "change_pct": p["change_pct"],
                        "quarter_delta": p["quarter_delta"],
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
