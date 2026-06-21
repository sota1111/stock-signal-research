"""ダッシュボード用の実データ(論文)を収集するスクリプト (SOT-909)。

これまでダッシュボードの論文データは `seed.py::_decade_papers()` が生成する**合成データ**
(ダミーのタイトル・引用数)だった。本スクリプトは各テーマについて arXiv API から
**実在する論文**を取得し、Semantic Scholar の batch API で**実際の被引用数**を付与して、
`backend/data/collected-papers.json` に書き出す。`seed.py` はこのJSONが存在すれば実データを、
無ければ従来の合成データ(オフライン/テスト用フォールバック)を使う。

実行:
    python -m scripts.collect_dashboard_papers          # backend/ をカレントにして
    # もしくは
    python backend/scripts/collect_dashboard_papers.py

外部APIキーは不要(arXiv / Semantic Scholar の公開エンドポイントを利用)。投資助言ではなく、
調査・仮説検証用の公開研究データとして扱う。
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

# テーマ名 -> arXiv 検索クエリ。テーマ名(=_DASHBOARD_THEMESのname)は保存時にそのまま
# theme として使い、SQLite/Firestore 両seederがtheme_idへ解決する。クエリはテーマに対して
# 関連論文が返るよう調整した語句(arXivのall:フィールド検索)。
THEME_QUERIES: dict[str, str] = {
    "SSD / NVMe": '"NVMe" AND ("SSD" OR "solid state drive")',
    "GPU memory bottleneck": '"GPU memory" AND ("bottleneck" OR "capacity" OR "offload")',
    "HBM": '"high bandwidth memory"',
    "KV cache offloading": '"KV cache" AND ("offload" OR "memory" OR "inference")',
    "I/O bottleneck": '"I/O bottleneck" AND ("deep learning" OR "training" OR "storage")',
    "data center power": '"data center" AND ("power" OR "energy efficiency")',
    "robotics foundation model": '"foundation model" AND "robot"',
    "CXL memory pooling": '"CXL" AND ("memory pooling" OR "memory expansion" OR "disaggregation")',
    "optical interconnect": '"optical interconnect" AND ("data center" OR "chip")',
    "liquid cooling": '"liquid cooling" AND ("data center" OR "server" OR "GPU")',
    "chiplet packaging": '"chiplet"',
    "advanced packaging CoWoS": '"advanced packaging" AND ("CoWoS" OR "2.5D" OR "interposer")',
    "EUV lithography": '"EUV" AND "lithography"',
    "silicon photonics": '"silicon photonics"',
    "LLM inference optimization": '"LLM inference" AND ("optimization" OR "serving" OR "latency")',
    "quantization": '"quantization" AND ("large language model" OR "neural network")',
    "mixture of experts": '"mixture of experts" AND ("language model" OR "transformer")',
    "retrieval augmented generation": '"retrieval augmented generation"',
    "vector database": '"vector database" OR "approximate nearest neighbor search"',
    "AI accelerator ASIC": '"AI accelerator" AND ("ASIC" OR "inference" OR "hardware")',
    "neuromorphic computing": '"neuromorphic computing"',
    "edge AI inference": '"edge" AND ("AI inference" OR "on-device inference" OR "tinyml")',
    "power semiconductor GaN SiC": '("GaN" OR "SiC") AND "power" AND "semiconductor"',
    "solid-state battery": '"solid-state battery"',
    "grid storage": '"grid" AND ("energy storage" OR "battery storage")',
    "humanoid robotics": '"humanoid" AND "robot"',
    "autonomous driving perception": '"autonomous driving" AND "perception"',
    "SmartNIC DPU": '"SmartNIC" OR "DPU" OR "data processing unit"',
    "NVMe-oF disaggregation": '"NVMe-oF" OR ("disaggregated" AND "storage")',
    "flash controller": '"flash" AND ("controller" OR "FTL" OR "SSD firmware")',
}


def _merge_sot994_queries() -> None:
    """SOT-994: backend/data/sot994_universe.json の70テーマ分の arXiv クエリを THEME_QUERIES に追加。
    既存30テーマは温存(setdefault)。これにより1回の実行で合計100テーマの論文を収集する。"""
    import json as _json
    import os as _os

    path = _os.path.join(_os.path.dirname(__file__), "..", "data", "sot994_universe.json")
    try:
        with open(path, encoding="utf-8") as f:
            data = _json.load(f)
    except (OSError, ValueError):
        return
    for t in data.get("themes", []):
        if t.get("name") and t.get("query"):
            THEME_QUERIES.setdefault(t["name"], t["query"])


_merge_sot994_queries()

ARXIV_API = "https://export.arxiv.org/api/query"
S2_BATCH_API = "https://api.semanticscholar.org/graph/v1/paper/batch"
ATOM = {"a": "http://www.w3.org/2005/Atom"}

# SOT-945: テーマ毎に「引用数 上位100件」を 2000年以降 から収集する。
# arXivの relevance 検索で大きめの候補プール(CANDIDATE_PER_THEME)をページングで集め、
# 年フィルタ(>=MIN_YEAR)を掛けたうえで Semantic Scholar の被引用数で降順ソートし、
# 上位 TOP_PER_THEME のみを残す。
TOP_PER_THEME = 100          # 1テーマあたり最終的に残す論文数(引用数 上位)
CANDIDATE_PER_THEME = 400    # 上位100を選ぶための候補プール上限(arXivから収集)
ARXIV_PAGE_SIZE = 100        # arXiv API の1ページ取得件数(start/max_resultsでページング)
MIN_YEAR = 2000              # これより前の論文は除外する(SOT-945: 2000年から再調査)
ARXIV_SLEEP = 3.0        # arXiv API への礼儀的な間隔(秒)
S2_BATCH_SIZE = 100      # Semantic Scholar batch の1リクエスト件数
S2_RETRIES = 4


def _http_get(url: str, timeout: int = 40) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "stock-signal-research/SOT-909"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _arxiv_id_from_entry(entry: ET.Element) -> str | None:
    raw = entry.findtext("a:id", default="", namespaces=ATOM)
    m = re.search(r"arxiv\.org/abs/([^\s]+)$", raw.strip())
    if not m:
        return None
    return re.sub(r"v\d+$", "", m.group(1))  # バージョン接尾辞を除去


def _parse_arxiv_page(data: bytes, theme: str) -> list[dict]:
    """arXiv APIのレスポンス(Atom)1ページ分をパースし、2000年以降の論文だけを返す。"""
    root = ET.fromstring(data)
    out: list[dict] = []
    for entry in root.findall("a:entry", ATOM):
        arxiv_id = _arxiv_id_from_entry(entry)
        title = (entry.findtext("a:title", default="", namespaces=ATOM) or "").strip()
        title = re.sub(r"\s+", " ", title)
        published = (entry.findtext("a:published", default="", namespaces=ATOM) or "").strip()
        abstract = (entry.findtext("a:summary", default="", namespaces=ATOM) or "").strip()
        abstract = re.sub(r"\s+", " ", abstract)
        if not arxiv_id or not title or len(published) < 7:
            continue
        # SOT-945: 2000年から再調査 — 発行年が MIN_YEAR より前の論文は除外する。
        try:
            year = int(published[:4])
        except ValueError:
            continue
        if year < MIN_YEAR:
            continue
        out.append({
            "paper_id": f"arxiv-{arxiv_id}",
            "title": title,
            "abstract": abstract,
            "published_at": published[:7],  # YYYY-MM
            "theme": theme,
            "citation_count": 0,
            "url": f"https://arxiv.org/abs/{arxiv_id}",
            "arxiv_id": arxiv_id,
            "doi": None,
        })
    return out


def fetch_arxiv(theme: str, query: str) -> list[dict]:
    """テーマの候補論文を arXiv からページングで最大 CANDIDATE_PER_THEME 件集める。

    relevance 降順で取得し、2000年以降のものだけ残す。被引用数による上位100件の絞り込みは
    呼び出し側(main)が enrich 後に行う。
    """
    out: list[dict] = []
    seen: set[str] = set()
    start = 0
    while len(out) < CANDIDATE_PER_THEME:
        params = urllib.parse.urlencode({
            "search_query": f"all:({query})",
            "start": start,
            "max_results": ARXIV_PAGE_SIZE,
            "sortBy": "relevance",
            "sortOrder": "descending",
        })
        data = _http_get(f"{ARXIV_API}?{params}")
        page = _parse_arxiv_page(data, theme)
        # arXivが entry を1件も返さなくなったら打ち切り(年フィルタで0件のページは
        # まだ後続があり得るので、raw entry 数ではなくレスポンスの総数で判断する)。
        root = ET.fromstring(data)
        raw_count = len(root.findall("a:entry", ATOM))
        for p in page:
            if p["paper_id"] in seen:
                continue
            seen.add(p["paper_id"])
            out.append(p)
        if raw_count < ARXIV_PAGE_SIZE:
            break  # 最終ページ
        start += ARXIV_PAGE_SIZE
        time.sleep(ARXIV_SLEEP)  # ページ間も礼儀的な間隔を空ける
    return out[:CANDIDATE_PER_THEME]


def enrich_citations(papers: list[dict]) -> None:
    """Semantic Scholar batch APIで被引用数(とDOI)を付与する(in-place)。失敗時は0のまま。"""
    by_arxiv = {p["arxiv_id"]: p for p in papers if p.get("arxiv_id")}
    ids = [f"ARXIV:{aid}" for aid in by_arxiv]
    fields = "title,year,citationCount,externalIds"
    for i in range(0, len(ids), S2_BATCH_SIZE):
        chunk = ids[i:i + S2_BATCH_SIZE]
        body = json.dumps({"ids": chunk}).encode()
        for attempt in range(S2_RETRIES):
            try:
                req = urllib.request.Request(
                    f"{S2_BATCH_API}?fields={urllib.parse.quote(fields)}",
                    data=body,
                    headers={"Content-Type": "application/json",
                             "User-Agent": "stock-signal-research/SOT-909"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=60) as resp:
                    results = json.loads(resp.read())
                for s2 in results:
                    if not s2:
                        continue
                    ext = s2.get("externalIds") or {}
                    aid = ext.get("ArXiv")
                    p = by_arxiv.get(aid)
                    if not p:
                        continue
                    if isinstance(s2.get("citationCount"), int):
                        p["citation_count"] = s2["citationCount"]
                    if ext.get("DOI"):
                        p["doi"] = ext["DOI"]
                break
            except Exception as e:  # noqa: BLE001 - best effort enrichment
                wait = 5 * (attempt + 1)
                print(f"  S2 batch retry {attempt + 1}/{S2_RETRIES} after error: {e} (wait {wait}s)",
                      file=sys.stderr)
                time.sleep(wait)
        time.sleep(2)


def main() -> int:
    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "collected-papers.json")
    out_path = os.path.abspath(out_path)

    all_papers: list[dict] = []
    seen_ids: set[str] = set()
    for theme, query in THEME_QUERIES.items():
        try:
            papers = fetch_arxiv(theme, query)
        except Exception as e:  # noqa: BLE001
            print(f"[WARN] arXiv fetch failed for '{theme}': {e}", file=sys.stderr)
            papers = []
        # 重複論文(複数テーマにヒット)は最初のテーマに割り当てる
        deduped = [p for p in papers if p["paper_id"] not in seen_ids]
        for p in deduped:
            seen_ids.add(p["paper_id"])
        all_papers.extend(deduped)
        print(f"[arXiv] {theme}: {len(deduped)} papers", file=sys.stderr)
        time.sleep(ARXIV_SLEEP)

    # 既存JSONの被引用数/DOIを引き継ぐ(再実行でS2が429でも実引用数を失わない)。
    if os.path.exists(out_path):
        try:
            with open(out_path, "r", encoding="utf-8") as f:
                prev = {p["paper_id"]: p for p in json.load(f)}
            for p in all_papers:
                old = prev.get(p["paper_id"])
                if old and old.get("citation_count"):
                    p["citation_count"] = old["citation_count"]
                    p["doi"] = p.get("doi") or old.get("doi")
            print(f"[merge] carried over citations from existing JSON ({len(prev)} prev)",
                  file=sys.stderr)
        except (OSError, ValueError):
            pass

    print(f"[S2] enriching citations for {len(all_papers)} candidate papers...", file=sys.stderr)
    enrich_citations(all_papers)

    # SOT-945: テーマ毎に被引用数で降順ソートし、上位 TOP_PER_THEME のみ残す。
    # 候補がTOP_PER_THEME未満のテーマはあるだけ残す(合成データでの水増しはしない)。
    by_theme: dict[str, list[dict]] = {}
    for p in all_papers:
        by_theme.setdefault(p["theme"], []).append(p)
    selected: list[dict] = []
    for theme in THEME_QUERIES:
        papers = by_theme.get(theme, [])
        papers.sort(key=lambda p: p.get("citation_count") or 0, reverse=True)
        top = papers[:TOP_PER_THEME]
        selected.extend(top)
        print(f"[select] {theme}: kept {len(top)}/{len(papers)} (top {TOP_PER_THEME} by citation)",
              file=sys.stderr)

    with_cite = sum(1 for p in selected if p["citation_count"] > 0)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(selected, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(selected)} real papers ({with_cite} with citation>0) to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
