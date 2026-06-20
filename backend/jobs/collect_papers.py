import os
import math
import logging
import uuid
import time
import json
import urllib.request
import urllib.parse
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

ARXIV_API_URL = "http://export.arxiv.org/api/query"
SEMANTIC_SCHOLAR_API_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
OPENALEX_API_URL = "https://api.openalex.org/works"
BATCH_SIZE = 50
MAX_RESULTS = 100

# --- OpenAlex citation-source tuning (SOT-899) ---
# OpenAlex は API キー不要で引用数(cited_by_count)を提供する。テーマごとに引用数の多い
# 順（cited_by_count:desc）で上位 OPENALEX_PER_THEME 件を取得し、引用数・リンク・概要を
# 蓄積する。これがダッシュボードの「テーマ別 引用数上位100論文の総引用数」指標の元データ。
# per_page は OpenAlex の上限 200 を超えないようにクランプする。
OPENALEX_PER_THEME = int(os.getenv("OPENALEX_PER_THEME", "100"))
OPENALEX_REQUEST_SLEEP_SEC = 1

# --- arXiv bulk-collection tuning (SOT-853) ---
# テーマごとに過去 ARXIV_YEARS 年分を「年単位のウィンドウ」で収集する。
# arXiv は submittedDate 降順のため単一の10年窓だと最新年に偏る。年ごとに区切って
# 取得することで、ダッシュボードの「年別論文件数(B1)/月次トレンド(B2)」が10年に分散し、
# かつテーマ×年で大量（合計数千件）に蓄積できる。各値は環境変数で上書き可能。
ARXIV_PER_THEME_PER_YEAR = int(os.getenv("ARXIV_PER_THEME_PER_YEAR", "100"))
ARXIV_PAGE_SIZE = int(os.getenv("ARXIV_PAGE_SIZE", "100"))
ARXIV_YEARS = int(os.getenv("ARXIV_YEARS", "10"))
# arXiv API のレート制限に配慮したリクエスト間スリープ秒数。
ARXIV_REQUEST_SLEEP_SEC = 3


def _get_theme_queries() -> List[str]:
    """テーマ一覧から検索クエリを生成。失敗時はデフォルトクエリにフォールバック"""
    default_queries = ["AI infrastructure", "large language model", "memory semiconductor"]
    try:
        app_env = os.getenv("APP_ENV", "local")
        if app_env == "local":
            import sys
            sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
            from app.database import SessionLocal
            from app.models import Theme
            db = SessionLocal()
            try:
                themes = db.query(Theme).all()
                if not themes:
                    return default_queries
                return [f"{t.name} {t.description or ''}".strip() for t in themes]
            finally:
                db.close()
        else:
            from firestore_client import get_db
            db = get_db()
            docs = db.collection("themes").stream()
            queries = []
            for doc in docs:
                data = doc.to_dict()
                name = data.get("name", "")
                desc = data.get("description", "")
                if name:
                    queries.append(f"{name} {desc}".strip())
            return queries if queries else default_queries
    except Exception as e:
        logger.warning(f"Failed to fetch themes for queries, using defaults: {e}")
        return default_queries


SAMPLE_PAPERS = [
    {
        "paper_id": "sample-2401.00001",
        "title": "Advances in Large Language Models for AI Infrastructure",
        "url": "https://arxiv.org/abs/2401.00001",
        "authors": ["Sample Author A", "Sample Author B"],
        "published_at": "2024-01-15",
        "abstract": "This paper explores recent advances in LLM infrastructure optimization.",
        "extracted_keywords": ["LLM", "AI Infrastructure", "optimization"],
        "source": "sample",
        "theme": "AI Infrastructure",
        "citation_count": 320,
    },
    {
        "paper_id": "sample-2401.00002",
        "title": "High-Bandwidth Memory Technologies for Next-Generation AI",
        "url": "https://arxiv.org/abs/2401.00002",
        "authors": ["Sample Author C"],
        "published_at": "2024-01-20",
        "abstract": "Survey of HBM technologies and their application to AI accelerators.",
        "extracted_keywords": ["HBM", "Memory", "AI accelerators"],
        "source": "sample",
        "theme": "Memory",
        "citation_count": 145,
    },
]


def run():
    job_run_id = str(uuid.uuid4())
    job_name = "collect-papers"
    start_time = datetime.now(timezone.utc)
    fetched_count = 0
    inserted_count = 0
    skipped_count = 0
    error_message = None

    logger.info(
        json.dumps({
            "jobRunId": job_run_id,
            "jobName": job_name,
            "status": "started",
            "startTime": start_time.isoformat(),
        })
    )

    use_firestore = os.getenv("APP_ENV", "local") != "local"

    if use_firestore:
        try:
            from firestore_client import save_job_run
            save_job_run(job_run_id, job_name, "started", startTime=start_time.isoformat())
        except Exception as e:
            logger.warning(f"Could not save job start to Firestore: {e}")

    try:
        use_sample = os.getenv("USE_SAMPLE_DATA", "false").lower() == "true"

        if use_sample:
            logger.info("USE_SAMPLE_DATA=true: using sample data")
            papers = SAMPLE_PAPERS
        else:
            papers = _fetch_from_arxiv()
            ss_papers = _fetch_from_semantic_scholar()
            if ss_papers:
                logger.info(f"Adding {len(ss_papers)} papers from Semantic Scholar")
                papers = papers + ss_papers
            oa_papers = _fetch_from_openalex()
            if oa_papers:
                logger.info(f"Adding {len(oa_papers)} papers from OpenAlex")
                papers = papers + oa_papers

        fetched_count = len(papers)

        for paper in papers:
            success = _save_paper(paper, use_firestore)
            if success:
                inserted_count += 1
            else:
                skipped_count += 1

    except Exception as e:
        error_message = str(e)
        logger.error(f"jobRunId={job_run_id} error: {e}")

    end_time = datetime.now(timezone.utc)
    status = "failed" if error_message else "completed"

    log_data = {
        "jobRunId": job_run_id,
        "jobName": job_name,
        "status": status,
        "startTime": start_time.isoformat(),
        "endTime": end_time.isoformat(),
        "fetchedCount": fetched_count,
        "insertedCount": inserted_count,
        "skippedCount": skipped_count,
        "source": "arxiv,semantic_scholar,openalex",
    }
    if error_message:
        log_data["errorMessage"] = error_message

    logger.info(json.dumps(log_data))

    if use_firestore:
        try:
            from firestore_client import save_job_run
            save_job_run(
                job_run_id, job_name, status,
                endTime=end_time.isoformat(),
                fetchedCount=fetched_count,
                insertedCount=inserted_count,
                skippedCount=skipped_count,
                source="arxiv,semantic_scholar,openalex",
                errorMessage=error_message,
            )
        except Exception as e:
            logger.warning(f"Could not save job completion to Firestore: {e}")


def _arxiv_year_windows(
    years: int, now: Optional[datetime] = None
) -> List[Tuple[int, str, str]]:
    """直近 `years` 年分を年単位の submittedDate ウィンドウに分割して返す。

    返り値は新しい年から順の `(year, from_yyyymmdd, to_yyyymmdd)` リスト。
    例: years=10, now=2025 -> 2025..2016 の各年 (降順)。
    """
    now = now or datetime.now(timezone.utc)
    end_year = now.year
    start_year = end_year - years + 1
    return [
        (y, f"{y}0101", f"{y}1231")
        for y in range(end_year, start_year - 1, -1)
    ]


def _build_arxiv_url(
    query: str,
    start: int,
    from_yyyymmdd: str,
    to_yyyymmdd: str,
    page_size: int,
) -> str:
    """テーマクエリ＋submittedDateウィンドウ＋ページング用の arXiv API URL を組み立てる。"""
    # キーワード部は必ず括弧でグルーピングする。括弧が無いと arXiv が複数語クエリと
    # `AND submittedDate` の結合を誤解釈し、日付フィルタが無視される（実測で確認）。
    search_query = (
        f"(all:{query}) AND "
        f"submittedDate:[{from_yyyymmdd}0000 TO {to_yyyymmdd}2359]"
    )
    params = urllib.parse.urlencode({
        "search_query": search_query,
        "start": start,
        "max_results": page_size,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
    })
    return f"{ARXIV_API_URL}?{params}"


def _fetch_from_arxiv() -> List[Dict[str, Any]]:
    """arXiv APIから論文を取得（APIキー不要）。

    各テーマについて直近 ARXIV_YEARS 年分を**年単位のウィンドウ**で取得する。
    arXiv は submittedDate 降順のため、年で区切らないと最新年に偏る。年ごとに
    `start` でページングし、各 (テーマ, 年) ごとに最大 ARXIV_PER_THEME_PER_YEAR 件
    まで取得する。ページが ARXIV_PAGE_SIZE 未満なら以降の結果無しとして打ち切る。
    paper_id でグローバルに重複排除する（テーマ横断/年跨ぎで同一論文は1件のみ）。
    """
    search_queries = _get_theme_queries()
    windows = _arxiv_year_windows(ARXIV_YEARS)
    # 各 (テーマ, 年) のページ上限（必ず有限回で終了させる安全弁）。
    max_pages = max(1, math.ceil(ARXIV_PER_THEME_PER_YEAR / ARXIV_PAGE_SIZE))

    papers: List[Dict[str, Any]] = []
    seen_ids: set = set()

    for query in search_queries:
        for year, from_yyyymmdd, to_yyyymmdd in windows:
            fetched_for_year = 0
            for page in range(max_pages):
                start = page * ARXIV_PAGE_SIZE
                url = _build_arxiv_url(query, start, from_yyyymmdd, to_yyyymmdd, ARXIV_PAGE_SIZE)
                try:
                    logger.info(f"Fetching arXiv papers query='{query}' year={year} start={start}")
                    with urllib.request.urlopen(url, timeout=30) as response:
                        xml_data = response.read()
                    parsed = _parse_arxiv_xml(xml_data)
                except urllib.error.URLError as e:
                    logger.warning(f"Failed to fetch arXiv query='{query}' year={year} start={start}: {e}. Stopping window.")
                    break
                except Exception as e:
                    logger.warning(f"Unexpected error fetching arXiv query='{query}' year={year} start={start}: {e}. Stopping window.")
                    break

                if not parsed:
                    break

                for p in parsed:
                    pid = p.get("paper_id")
                    if pid and pid in seen_ids:
                        continue
                    if pid:
                        seen_ids.add(pid)
                    # 取得元テーマを記録（SQLite 側で theme 名照合に利用、無ければ無視される）。
                    p.setdefault("theme", query)
                    papers.append(p)
                    fetched_for_year += 1

                # これ以上の結果が無い、または年内目標件数に達したら打ち切り。
                if len(parsed) < ARXIV_PAGE_SIZE or fetched_for_year >= ARXIV_PER_THEME_PER_YEAR:
                    break

                time.sleep(ARXIV_REQUEST_SLEEP_SEC)  # arXiv API rate limit

    logger.info(
        f"arXiv fetch complete: {len(papers)} unique papers across "
        f"{len(search_queries)} themes x {len(windows)} years"
    )
    return papers


def _fetch_from_semantic_scholar() -> List[Dict[str, Any]]:
    """Semantic Scholar APIから論文を取得（SEMANTIC_SCHOLAR_API_KEY が必要）"""
    api_key = os.getenv("SEMANTIC_SCHOLAR_API_KEY")
    if not api_key:
        logger.info("SEMANTIC_SCHOLAR_API_KEY not set, skipping Semantic Scholar")
        return []

    search_queries = _get_theme_queries()
    papers = []
    fields = "paperId,title,authors,year,abstract,externalIds,publicationDate,citationCount"

    for query in search_queries:
        try:
            params = urllib.parse.urlencode({
                "query": query,
                "limit": 10,
                "fields": fields,
            })
            url = f"{SEMANTIC_SCHOLAR_API_URL}?{params}"
            req = urllib.request.Request(url, headers={"x-api-key": api_key})
            logger.info(f"Fetching Semantic Scholar papers for query: {query}")

            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.loads(response.read())

            for item in data.get("data", []):
                paper_id = item.get("paperId", "")
                if not paper_id:
                    continue
                authors = [a.get("name", "") for a in item.get("authors", [])]
                pub_date = item.get("publicationDate") or str(item.get("year", ""))
                papers.append({
                    "paper_id": f"ss-{paper_id}",
                    "title": item.get("title", ""),
                    "url": f"https://www.semanticscholar.org/paper/{paper_id}",
                    "authors": authors,
                    "published_at": pub_date[:10] if pub_date else "",
                    "abstract": (item.get("abstract") or "")[:1000],
                    "extracted_keywords": [],
                    "source": "semantic_scholar",
                    "citation_count": item.get("citationCount") or 0,
                })
            logger.info(f"Fetched {len(data.get('data', []))} papers from Semantic Scholar for: {query}")
            time.sleep(1)

        except urllib.error.HTTPError as e:
            logger.warning(f"Semantic Scholar HTTP error for '{query}': {e}. Skipping.")
        except Exception as e:
            logger.warning(f"Semantic Scholar error for '{query}': {e}. Skipping.")

    return papers


def _reconstruct_abstract(inverted_index: Optional[Dict[str, List[int]]]) -> str:
    """OpenAlex の abstract_inverted_index（語→出現位置リスト）から本文を復元する。

    OpenAlex は著作権配慮のため abstract を「単語→位置」の転置インデックスで返す。
    位置順に語を並べ直して通常の文字列に戻す。None/空なら空文字を返す。
    """
    if not inverted_index or not isinstance(inverted_index, dict):
        return ""
    positions: List[Tuple[int, str]] = []
    for word, idxs in inverted_index.items():
        if not isinstance(idxs, list):
            continue
        for i in idxs:
            try:
                positions.append((int(i), word))
            except (TypeError, ValueError):
                continue
    positions.sort(key=lambda x: x[0])
    return " ".join(w for _, w in positions)


def _parse_openalex_works(data: Dict[str, Any], theme: str) -> List[Dict[str, Any]]:
    """OpenAlex の works レスポンス(JSON)を共通の paper dict 形状にパースする。"""
    papers = []
    for work in data.get("results", []):
        try:
            oa_id = work.get("id") or ""
            short_id = oa_id.rstrip("/").split("/")[-1] if oa_id else ""
            if not short_id:
                continue
            doi = work.get("doi")
            url = doi or oa_id
            authors = [
                a.get("author", {}).get("display_name", "")
                for a in work.get("authorships", [])
                if isinstance(a, dict) and a.get("author")
            ]
            pub_date = work.get("publication_date") or str(work.get("publication_year") or "")
            abstract = _reconstruct_abstract(work.get("abstract_inverted_index"))
            papers.append({
                "paper_id": f"openalex-{short_id}",
                "title": work.get("display_name") or "",
                "url": url,
                "authors": [a for a in authors if a],
                "published_at": pub_date[:10] if pub_date else "",
                "abstract": abstract[:1000],
                "extracted_keywords": [],
                "source": "openalex",
                "citation_count": work.get("cited_by_count") or 0,
                "theme": theme,
            })
        except Exception as e:
            logger.debug(f"Failed to parse OpenAlex work: {e}")
    return papers


def _fetch_from_openalex() -> List[Dict[str, Any]]:
    """OpenAlex APIから引用数上位の論文を取得（APIキー不要）。

    各テーマについて cited_by_count 降順で上位 OPENALEX_PER_THEME 件を取得し、
    引用数(citation_count)・リンク(url)・概要(abstract)付きで返す。
    paper_id でグローバルに重複排除する。OPENALEX_MAILTO があれば polite pool に付与。
    """
    search_queries = _get_theme_queries()
    per_page = max(1, min(OPENALEX_PER_THEME, 200))  # OpenAlex per_page 上限は 200
    mailto = os.getenv("OPENALEX_MAILTO")

    papers: List[Dict[str, Any]] = []
    seen_ids: set = set()

    for query in search_queries:
        params = {
            "search": query,
            "sort": "cited_by_count:desc",
            "per_page": per_page,
            "select": (
                "id,doi,display_name,publication_date,publication_year,"
                "cited_by_count,abstract_inverted_index,authorships"
            ),
        }
        if mailto:
            params["mailto"] = mailto
        url = f"{OPENALEX_API_URL}?{urllib.parse.urlencode(params)}"
        try:
            logger.info(f"Fetching OpenAlex papers for query: {query}")
            with urllib.request.urlopen(url, timeout=30) as response:
                data = json.loads(response.read())
        except urllib.error.HTTPError as e:
            logger.warning(f"OpenAlex HTTP error for '{query}': {e}. Skipping.")
            continue
        except Exception as e:
            logger.warning(f"OpenAlex error for '{query}': {e}. Skipping.")
            continue

        for p in _parse_openalex_works(data, query):
            pid = p.get("paper_id")
            if pid and pid in seen_ids:
                continue
            if pid:
                seen_ids.add(pid)
            papers.append(p)

        time.sleep(OPENALEX_REQUEST_SLEEP_SEC)  # OpenAlex politeness / rate limit

    logger.info(
        f"OpenAlex fetch complete: {len(papers)} unique papers across "
        f"{len(search_queries)} themes"
    )
    return papers


def _parse_arxiv_xml(xml_data: bytes) -> List[Dict[str, Any]]:
    """arXiv XMLレスポンスをパース"""
    papers = []
    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "arxiv": "http://arxiv.org/schemas/atom",
    }

    root = ET.fromstring(xml_data)
    for entry in root.findall("atom:entry", ns):
        try:
            paper_id_url = entry.find("atom:id", ns).text.strip()
            paper_id = paper_id_url.split("/abs/")[-1] if "/abs/" in paper_id_url else paper_id_url

            title_el = entry.find("atom:title", ns)
            title = title_el.text.strip().replace("\n", " ") if title_el is not None else ""

            published_el = entry.find("atom:published", ns)
            published_at = published_el.text[:10] if published_el is not None else ""

            abstract_el = entry.find("atom:summary", ns)
            abstract = abstract_el.text.strip().replace("\n", " ") if abstract_el is not None else ""

            authors = [
                a.find("atom:name", ns).text
                for a in entry.findall("atom:author", ns)
                if a.find("atom:name", ns) is not None
            ]

            keywords_el = entry.find("arxiv:primary_category", ns)
            keywords = [keywords_el.attrib.get("term", "")] if keywords_el is not None else []

            papers.append({
                "paper_id": paper_id,
                "title": title,
                "url": paper_id_url,
                "authors": authors,
                "published_at": published_at,
                "abstract": abstract[:1000],
                "extracted_keywords": keywords,
                "source": "arxiv",
                "citation_count": 0,  # arXiv API は引用数を提供しない
            })
        except Exception as e:
            logger.debug(f"Failed to parse arXiv entry: {e}")

    return papers


def _save_paper(paper: Dict[str, Any], use_firestore: bool) -> bool:
    """論文を保存（冪等）"""
    try:
        import sys
        import os
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
        from app.repositories.paper_repository import get_paper_repository
        repo = get_paper_repository()
        return repo.save(paper)
    except Exception as e:
        logger.error(f"Failed to save paper {paper.get('paper_id')}: {e}")
        return False
