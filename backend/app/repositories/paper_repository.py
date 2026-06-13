import json
import logging
import os
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Dict, Any

logger = logging.getLogger(__name__)


class PaperRepository(ABC):
    @abstractmethod
    def save(self, paper: Dict[str, Any]) -> bool:
        """Save a paper idempotently. Returns True on success."""
        ...


class SQLitePaperRepository(PaperRepository):
    def save(self, paper: Dict[str, Any]) -> bool:
        try:
            from app.database import SessionLocal
            from app.models import Paper
            db = SessionLocal()
            try:
                existing = db.query(Paper).filter(Paper.paper_id == paper["paper_id"]).first()
                if existing:
                    existing.title = paper.get("title", existing.title)
                    existing.url = paper.get("url", existing.url)
                    existing.authors = json.dumps(paper.get("authors", []))
                    existing.published_at = paper.get("published_at", existing.published_at)
                    existing.abstract = paper.get("abstract", existing.abstract)
                    existing.extracted_keywords = json.dumps(paper.get("extracted_keywords", []))
                    existing.source = paper.get("source", existing.source)
                else:
                    new_paper = Paper(
                        paper_id=paper["paper_id"],
                        title=paper.get("title", ""),
                        url=paper.get("url", ""),
                        authors=json.dumps(paper.get("authors", [])),
                        published_at=paper.get("published_at", ""),
                        abstract=paper.get("abstract", ""),
                        extracted_keywords=json.dumps(paper.get("extracted_keywords", [])),
                        source=paper.get("source", "arxiv"),
                    )
                    db.add(new_paper)
                db.commit()
                return True
            except Exception as e:
                db.rollback()
                logger.error(f"SQLite save failed for paper {paper.get('paper_id')}: {e}")
                return False
            finally:
                db.close()
        except Exception as e:
            logger.error(f"SQLite repository error: {e}")
            return False


class FirestorePaperRepository(PaperRepository):
    def save(self, paper: Dict[str, Any]) -> bool:
        try:
            from firestore_client import upsert_document
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
            logger.error(f"Firestore save failed for paper {paper.get('paper_id')}: {e}")
            return False


def get_paper_repository() -> PaperRepository:
    """Factory: returns SQLite repo for local, Firestore repo for production."""
    app_env = os.getenv("APP_ENV", "local")
    if app_env == "local":
        logger.debug("PaperRepository: using SQLitePaperRepository")
        return SQLitePaperRepository()
    else:
        logger.debug(f"PaperRepository: using FirestorePaperRepository (APP_ENV={app_env})")
        return FirestorePaperRepository()
