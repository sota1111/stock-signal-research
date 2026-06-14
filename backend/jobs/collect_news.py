import os
import logging
import uuid
import json
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import List, Dict, Any
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)

RSS_FEEDS = [
    {
        "url": "https://feeds.feedburner.com/techcrunch",
        "source": "techcrunch",
    },
    {
        "url": "https://www.theverge.com/rss/index.xml",
        "source": "theverge",
    },
]

SAMPLE_NEWS = [
    {
        "news_id": "sample-news-001",
        "title": "NVIDIA Announces Next-Generation AI Infrastructure Platform",
        "url": "https://example.com/nvidia-ai-infra",
        "published_at": "2024-01-15",
        "summary": "NVIDIA reveals new platform for large-scale AI training.",
        "source": "sample",
        "theme": "AI Infrastructure",
    },
    {
        "news_id": "sample-news-002",
        "title": "Samsung Develops 36GB HBM4 for AI Accelerators",
        "url": "https://example.com/samsung-hbm4",
        "published_at": "2024-01-18",
        "summary": "Samsung's new HBM4 memory doubles bandwidth for AI workloads.",
        "source": "sample",
        "theme": "Memory",
    },
]


def run():
    job_run_id = str(uuid.uuid4())
    job_name = "collect-news"
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
            news_items = SAMPLE_NEWS
        else:
            news_items = _fetch_from_rss()

        fetched_count = len(news_items)

        for item in news_items:
            success = _save_news(item, use_firestore)
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
        "source": "rss",
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
                source="rss",
                errorMessage=error_message,
            )
        except Exception as e:
            logger.warning(f"Could not save job completion to Firestore: {e}")


def _fetch_from_rss() -> List[Dict[str, Any]]:
    """RSS フィードからニュースを取得"""
    news_items = []
    for feed in RSS_FEEDS:
        try:
            logger.info(f"Fetching RSS: {feed['url']}")
            with urllib.request.urlopen(feed["url"], timeout=15) as response:
                xml_data = response.read()
            parsed = _parse_rss(xml_data, feed["source"])
            news_items.extend(parsed)
            logger.info(f"Fetched {len(parsed)} items from {feed['source']}")
            time.sleep(1)
        except urllib.error.URLError as e:
            logger.warning(f"Failed to fetch RSS {feed['url']}: {e}. Skipping.")
        except Exception as e:
            logger.warning(f"Unexpected error fetching RSS {feed['url']}: {e}. Skipping.")
    return news_items


def _parse_rss(xml_data: bytes, source: str) -> List[Dict[str, Any]]:
    """RSSまたはAtom XMLをパース"""
    items = []
    try:
        root = ET.fromstring(xml_data)

        # RSS 2.0
        for item in root.findall(".//item"):
            title_el = item.find("title")
            link_el = item.find("link")
            pub_el = item.find("pubDate")
            desc_el = item.find("description")

            if title_el is None:
                continue

            title = title_el.text or ""
            url = link_el.text if link_el is not None else ""
            pub_date = pub_el.text[:10] if pub_el is not None and pub_el.text else ""
            summary = desc_el.text[:500] if desc_el is not None and desc_el.text else ""

            news_id = f"{source}-{url.split('/')[-1][:50]}" if url else f"{source}-{uuid.uuid4().hex[:8]}"

            items.append({
                "news_id": news_id,
                "title": title[:200],
                "url": url,
                "published_at": pub_date,
                "summary": summary,
                "source": source,
            })

        if not items:
            # Atom feed
            ns = {"atom": "http://www.w3.org/2005/Atom"}
            for entry in root.findall("atom:entry", ns):
                title_el = entry.find("atom:title", ns)
                link_el = entry.find("atom:link", ns)
                pub_el = entry.find("atom:published", ns)
                summary_el = entry.find("atom:summary", ns)

                if title_el is None:
                    continue

                title = title_el.text or ""
                url = link_el.attrib.get("href", "") if link_el is not None else ""
                pub_date = pub_el.text[:10] if pub_el is not None and pub_el.text else ""
                summary = summary_el.text[:500] if summary_el is not None and summary_el.text else ""

                news_id = f"{source}-{url.split('/')[-1][:50]}" if url else f"{source}-{uuid.uuid4().hex[:8]}"
                items.append({
                    "news_id": news_id,
                    "title": title[:200],
                    "url": url,
                    "published_at": pub_date,
                    "summary": summary,
                    "source": source,
                })

    except ET.ParseError as e:
        logger.warning(f"Failed to parse RSS XML from {source}: {e}")

    return items


def _save_news(item: Dict[str, Any], use_firestore: bool) -> bool:
    """ニュースを保存（冪等）"""
    if not use_firestore:
        return _save_news_to_sqlite(item)

    try:
        from firestore_client import upsert_document
        from datetime import datetime, timezone
        doc_id = item["news_id"].replace("/", "_").replace(" ", "_")[:100]
        data = {
            **item,
            "createdAt": datetime.now(timezone.utc),
        }
        return upsert_document("news", doc_id, data)
    except Exception as e:
        logger.error(f"Failed to save news {item.get('news_id')}: {e}")
        return False


def _save_news_to_sqlite(item: Dict[str, Any]) -> bool:
    """ニュースを SQLite に保存"""
    try:
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
        from app.database import SessionLocal
        from app.models import ExternalInfo, Theme

        db = SessionLocal()
        try:
            # Idempotent check
            existing = db.query(ExternalInfo).filter(ExternalInfo.info_id == item["news_id"]).first()
            if existing:
                return True

            # Theme lookup
            theme_id = None
            theme_name = item.get("theme")
            if theme_name:
                theme = db.query(Theme).filter(Theme.name.ilike(theme_name)).first()
                if theme:
                    theme_id = theme.id

            new_info = ExternalInfo(
                info_id=item["news_id"],
                info_type="news",
                title=item["title"],
                url=item.get("url", ""),
                summary=item.get("summary", ""),
                source_name=item.get("source", ""),
                published_at=item.get("published_at", ""),
                related_company=item.get("company"),
                theme_id=theme_id,
                relevance_score=item.get("relevance_score", 0.5),
            )
            db.add(new_info)
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            logger.error(f"SQLite save failed for news {item.get('news_id')}: {e}")
            return False
        finally:
            db.close()
    except Exception as e:
        logger.error(f"SQLite repository error in _save_news_to_sqlite: {e}")
        return False
