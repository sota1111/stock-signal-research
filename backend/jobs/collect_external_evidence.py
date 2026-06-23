"""構造化された外部エビデンス(ニュース/IR/決算/SEC filing)の収集ジョブ (SOT-1123)。

候補F。既存の `collect_news.py` は RSS ニュースのみ・種別分割なしだったため、本ジョブで
種別(news / announcement / earnings / filing)ごとに収集し、重複排除して構造化保存する。

- filing: SEC EDGAR submissions API からの実 filing(本ジョブ実行時にライブ取得可能)。
- news / announcement / earnings: 事前収集済みの実データセット
  `backend/data/external-evidence.json` から取り込む(ランタイムに外部ニュース API を
  持たないため)。SEC filing はライブ取得分とデータセット分をマージして重複排除する。

投資助言ではなく、調査・仮説検証用データとして扱う。
"""
import os
import re
import json
import time
import hashlib
import logging
import urllib.request
from datetime import datetime, timezone
from typing import List, Dict, Any, Iterable, Optional

logger = logging.getLogger(__name__)

# SEC は識別可能な User-Agent を要求する(連絡先付き)。
USER_AGENT = os.getenv("SEC_USER_AGENT", "stock-signal-research research-bot contact@example.com")

VALID_TYPES = ("news", "announcement", "earnings", "filing")

_EARNINGS_RE = re.compile(
    r"\b(earnings|quarter|quarterly|q[1-4]\b|results|revenue|guidance|beat|miss|eps|profit|sales)\b",
    re.I,
)
_ANNOUNCE_RE = re.compile(
    r"\b(announce|announces|announced|launch|launches|unveil|unveils|introduc|expan|partner|"
    r"partnership|lands|deal|wins|raises?|price target|upgrade|downgrade|reaffirm|lifts)\b",
    re.I,
)

DATA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "external-evidence.json")

# SEC filing をライブ取得する代表企業(ticker, company, primary theme name)。
SEC_COMPANIES = [
    ("NVDA", "NVIDIA", "GPU memory bottleneck"),
    ("AMD", "AMD", "AI accelerator ASIC"),
    ("INTC", "Intel", "chiplet packaging"),
    ("MU", "Micron", "HBM"),
    ("AVGO", "Broadcom", "optical interconnect"),
    ("AMAT", "Applied Materials", "advanced packaging CoWoS"),
    ("LRCX", "Lam Research", "advanced packaging CoWoS"),
    ("MRVL", "Marvell", "optical interconnect"),
    ("WDC", "Western Digital", "SSD / NVMe"),
    ("ANET", "Arista Networks", "data center power"),
]
SEC_FORMS = {"10-K", "10-Q", "8-K", "20-F", "6-K", "S-1", "424B5"}

RELEVANCE_BY_TYPE = {"filing": 70.0, "earnings": 85.0, "announcement": 78.0, "news": 60.0}


# --------------------------------------------------------------------------- #
# Pure helpers (unit-tested)
# --------------------------------------------------------------------------- #
def classify_info_type(title: str, summary: str = "", source_name: str = "") -> str:
    """ニュース見出し/要約から種別を判定する。

    SEC など filing ソースは source_name で明示判定し、それ以外は決算→IR→ニュースの
    優先順で見出しキーワードから分類する。"""
    text = f"{title or ''} {summary or ''}"
    src = (source_name or "").lower()
    if "edgar" in src or "sec filing" in src:
        return "filing"
    if _EARNINGS_RE.search(text):
        return "earnings"
    if _ANNOUNCE_RE.search(text):
        return "announcement"
    return "news"


def build_info_id(record: Dict[str, Any]) -> str:
    """url(なければ title)から安定した info_id を生成する。"""
    prefix = "filing" if record.get("info_type") == "filing" else "news"
    basis = record.get("url") or record.get("title") or ""
    digest = hashlib.sha1(basis.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}-{digest}"


def _normalize_url(url: Optional[str]) -> str:
    if not url:
        return ""
    return url.split("?")[0].rstrip("/").lower()


def dedupe_records(records: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """info_id と正規化 URL の双方で重複排除する(先勝ち)。"""
    seen_ids, seen_urls, out = set(), set(), []
    for r in records:
        info_id = r.get("info_id") or build_info_id(r)
        r.setdefault("info_id", info_id)
        nurl = _normalize_url(r.get("url"))
        if info_id in seen_ids or (nurl and nurl in seen_urls):
            continue
        seen_ids.add(info_id)
        if nurl:
            seen_urls.add(nurl)
        out.append(r)
    return out


def normalize_record(raw: Dict[str, Any]) -> Dict[str, Any]:
    """生レコードを ExternalInfo 形に整える(info_type / info_id / relevance を補完)。"""
    info_type = raw.get("info_type")
    if info_type not in VALID_TYPES:
        info_type = classify_info_type(raw.get("title", ""), raw.get("summary", ""), raw.get("source_name", ""))
    rec = {
        "info_type": info_type,
        "title": raw.get("title", ""),
        "url": raw.get("url"),
        "summary": raw.get("summary"),
        "source_name": raw.get("source_name"),
        "published_at": raw.get("published_at"),
        "related_company": raw.get("related_company"),
        "theme_name": raw.get("theme_name"),
        "relevance_score": raw.get("relevance_score", RELEVANCE_BY_TYPE.get(info_type, 60.0)),
    }
    rec["info_id"] = raw.get("info_id") or build_info_id(rec)
    return rec


# --------------------------------------------------------------------------- #
# Collectors
# --------------------------------------------------------------------------- #
def _get_json(url: str) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def collect_sec_filings(companies=SEC_COMPANIES, forms=SEC_FORMS, per_company: int = 4,
                        sleep: float = 0.4) -> List[Dict[str, Any]]:
    """SEC EDGAR submissions API から代表企業の直近 filing を取得する(ライブ)。"""
    try:
        ticker_map = _get_json("https://www.sec.gov/files/company_tickers.json")
    except Exception as e:  # ネットワーク不可時は空(呼び出し側でデータセットにフォールバック)
        logger.warning(f"SEC company_tickers fetch failed: {e}")
        return []
    by_ticker = {v["ticker"].upper(): str(v["cik_str"]).zfill(10) for v in ticker_map.values()}

    out: List[Dict[str, Any]] = []
    for ticker, company, theme in companies:
        cik = by_ticker.get(ticker.upper())
        if not cik:
            continue
        try:
            sub = _get_json(f"https://data.sec.gov/submissions/CIK{cik}.json")
        except Exception as e:
            logger.warning(f"SEC submissions fetch failed for {ticker}: {e}")
            continue
        rec = sub.get("filings", {}).get("recent", {})
        cik_int = int(cik)
        taken = 0
        for i in range(len(rec.get("form", []))):
            form = rec["form"][i]
            if form not in forms:
                continue
            acc = rec["accessionNumber"][i]
            acc_nodash = acc.replace("-", "")
            doc = rec["primaryDocument"][i]
            date = rec["filingDate"][i]
            desc = rec["primaryDocDescription"][i] or form
            url = (f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_nodash}/{doc}"
                   if doc else
                   f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type={form}")
            title = f"{company} files {form}" if not desc or desc == form else f"{company} files {form} ({desc})"
            out.append(normalize_record({
                "info_type": "filing",
                "title": title,
                "url": url,
                "summary": f"SEC EDGAR {form} filing by {company} (accession {acc}).",
                "source_name": "SEC EDGAR",
                "published_at": date,
                "related_company": company,
                "theme_name": theme,
            }))
            taken += 1
            if taken >= per_company:
                break
        time.sleep(sleep)
    return out


def load_committed_dataset(path: str = DATA_PATH) -> List[Dict[str, Any]]:
    """事前収集済みの実データセットを読み込む。"""
    if not os.path.exists(path):
        return []
    try:
        with open(path, encoding="utf-8") as f:
            payload = json.load(f)
    except Exception as e:
        logger.warning(f"Failed to load committed dataset: {e}")
        return []
    items = payload.get("items", []) if isinstance(payload, dict) else payload
    return [normalize_record(it) for it in items]


def collect_all(live_sec: bool = True) -> List[Dict[str, Any]]:
    """全種別を収集し重複排除した構造化レコードを返す。"""
    records: List[Dict[str, Any]] = list(load_committed_dataset())
    if live_sec:
        records.extend(collect_sec_filings())
    return dedupe_records(records)


def _save(record: Dict[str, Any]) -> bool:
    """ExternalInfo を repository 経由で冪等保存する(theme は name で名寄せ)。"""
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    from app.database import SessionLocal
    from app.models import Theme
    from app.repositories.news_repository import get_news_repository

    theme_id = None
    theme_name = record.get("theme_name")
    if theme_name:
        db = SessionLocal()
        try:
            theme = (db.query(Theme).filter(Theme.name.ilike(theme_name)).first()
                     or db.query(Theme).filter(Theme.name.ilike(f"%{theme_name}%")).first())
            theme_id = theme.id if theme else None
        finally:
            db.close()

    repo = get_news_repository()
    return repo.save({
        "info_id": record["info_id"],
        "info_type": record["info_type"],
        "title": record["title"],
        "url": record.get("url"),
        "summary": record.get("summary"),
        "source_name": record.get("source_name"),
        "published_at": record.get("published_at"),
        "related_company": record.get("related_company"),
        "theme_id": theme_id,
        "relevance_score": record.get("relevance_score", 60.0),
    })


def run(live_sec: bool = True) -> Dict[str, int]:
    job_run_id = datetime.now(timezone.utc).isoformat()
    records = collect_all(live_sec=live_sec)
    inserted = skipped = 0
    by_type: Dict[str, int] = {}
    for r in records:
        by_type[r["info_type"]] = by_type.get(r["info_type"], 0) + 1
        if _save(r):
            inserted += 1
        else:
            skipped += 1
    summary = {"fetched": len(records), "inserted": inserted, "skipped": skipped, **{f"type_{k}": v for k, v in by_type.items()}}
    logger.info(json.dumps({"jobRunId": job_run_id, "jobName": "collect-external-evidence", "status": "completed", **summary}))
    return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(run())
