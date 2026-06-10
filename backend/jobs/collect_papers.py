import os
import logging
import uuid
import time
import json
import urllib.request
import urllib.parse
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

ARXIV_API_URL = "http://export.arxiv.org/api/query"
BATCH_SIZE = 50
MAX_RESULTS = 100

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
        "source": "arxiv",
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
                source="arxiv",
                errorMessage=error_message,
            )
        except Exception as e:
            logger.warning(f"Could not save job completion to Firestore: {e}")


def _fetch_from_arxiv() -> List[Dict[str, Any]]:
    """arXiv APIから論文を取得（APIキー不要）"""
    search_queries = ["AI infrastructure", "large language model", "memory semiconductor"]
    papers = []

    for query in search_queries:
        try:
            params = urllib.parse.urlencode({
                "search_query": f"all:{query}",
                "start": 0,
                "max_results": MAX_RESULTS // len(search_queries),
                "sortBy": "submittedDate",
                "sortOrder": "descending",
            })
            url = f"{ARXIV_API_URL}?{params}"
            logger.info(f"Fetching arXiv papers for query: {query}")

            with urllib.request.urlopen(url, timeout=30) as response:
                xml_data = response.read()

            parsed = _parse_arxiv_xml(xml_data)
            papers.extend(parsed)
            logger.info(f"Fetched {len(parsed)} papers for query: {query}")

            time.sleep(3)  # arXiv API rate limit

        except urllib.error.URLError as e:
            logger.warning(f"Failed to fetch from arXiv for query '{query}': {e}. Skipping.")
        except Exception as e:
            logger.warning(f"Unexpected error fetching arXiv for query '{query}': {e}. Skipping.")

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
            })
        except Exception as e:
            logger.debug(f"Failed to parse arXiv entry: {e}")

    return papers


def _save_paper(paper: Dict[str, Any], use_firestore: bool) -> bool:
    """論文を保存（冪等）"""
    if not use_firestore:
        logger.debug(f"Skipping Firestore save (APP_ENV=local): {paper['paper_id']}")
        return True

    try:
        from firestore_client import upsert_document
        from datetime import datetime, timezone
        doc_id = paper["paper_id"].replace("/", "_")
        data = {
            **paper,
            "authors": json.dumps(paper.get("authors", [])),
            "extracted_keywords": json.dumps(paper.get("extracted_keywords", [])),
            "createdAt": datetime.now(timezone.utc),
            "source": paper.get("source", "arxiv"),
        }
        return upsert_document("papers", doc_id, data)
    except Exception as e:
        logger.error(f"Failed to save paper {paper.get('paper_id')}: {e}")
        return False
