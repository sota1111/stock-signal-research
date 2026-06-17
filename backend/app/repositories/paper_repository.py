import json
import logging
import os
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


class PaperRepository(ABC):
    @abstractmethod
    def save(self, paper: Dict[str, Any]) -> bool:
        """Save a paper idempotently. Returns True on success."""
        ...

    @abstractmethod
    def list_all(self, theme_id: str = None) -> List[Dict[str, Any]]:
        """List all papers, optionally filtered by theme_id."""
        ...


class SQLitePaperRepository(PaperRepository):
    def __init__(self, session_factory=None):
        from app.database import SessionLocal
        self._session_factory = session_factory or SessionLocal

    def save(self, paper: Dict[str, Any]) -> bool:
        try:
            from app.models import Paper, Theme
            db = self._session_factory()

            def _get_theme_id(db, theme_name: str):
                if not theme_name:
                    return None
                theme = db.query(Theme).filter(
                    Theme.name.ilike(theme_name)
                ).first()
                return theme.id if theme else None

            try:
                theme_id = _get_theme_id(db, paper.get("theme", ""))
                existing = db.query(Paper).filter(Paper.paper_id == paper["paper_id"]).first()
                if existing:
                    paper["id"] = existing.id
                    existing.title = paper.get("title", existing.title)
                    existing.url = paper.get("url", existing.url)
                    existing.authors = json.dumps(paper.get("authors", [])) if isinstance(
                        paper.get("authors"), list) else paper.get("authors", existing.authors)
                    existing.published_at = paper.get("published_at", existing.published_at)
                    existing.abstract = paper.get("abstract", existing.abstract)
                    existing.extracted_keywords = (
                        json.dumps(paper.get("extracted_keywords", []))
                        if isinstance(paper.get("extracted_keywords"), list)
                        else paper.get("extracted_keywords", existing.extracted_keywords)
                    )
                    existing.source = paper.get("source", existing.source)
                    if not existing.theme_id and theme_id:
                        existing.theme_id = theme_id
                else:
                    if not paper.get("id"):
                        import uuid
                        paper["id"] = str(uuid.uuid4())
                    
                    new_paper = Paper(
                        id=paper["id"],
                        paper_id=paper["paper_id"],
                        title=paper.get("title", ""),
                        url=paper.get("url", ""),
                        authors=json.dumps(paper.get("authors", [])) if isinstance(
                            paper.get("authors"), list) else paper.get("authors", "[]"),
                        published_at=paper.get("published_at", ""),
                        abstract=paper.get("abstract", ""),
                        extracted_keywords=json.dumps(paper.get("extracted_keywords", [])) if isinstance(
                            paper.get("extracted_keywords"), list) else paper.get("extracted_keywords", "[]"),
                        source=paper.get("source", "arxiv"),
                        theme_id=theme_id,
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

    def list_all(self, theme_id: str = None) -> List[Dict[str, Any]]:
        try:
            from app.models import Paper
            db = self._session_factory()
            try:
                query = db.query(Paper)
                if theme_id:
                    query = query.filter(Paper.theme_id == theme_id)
                papers = query.all()
                return [
                    {
                        "id": p.id,
                        "paper_id": p.paper_id,
                        "title": p.title,
                        "url": p.url,
                        "authors": p.authors,
                        "published_at": p.published_at,
                        "abstract": p.abstract,
                        "extracted_keywords": p.extracted_keywords,
                        "source": p.source,
                        "theme_id": p.theme_id,
                        "created_at": p.created_at,
                    }
                    for p in papers
                ]
            finally:
                db.close()
        except Exception as e:
            logger.error(f"SQLite list_all failed: {e}")
            return []


class FirestorePaperRepository(PaperRepository):
    def save(self, paper: Dict[str, Any]) -> bool:
        try:
            from firestore_client import upsert_document
            doc_id = paper["paper_id"].replace("/", "_")
            data = {
                **paper,
                "authors": (
                    json.dumps(paper.get("authors", []))
                    if isinstance(paper.get("authors"), list)
                    else paper.get("authors", "[]")
                ),
                "extracted_keywords": (
                    json.dumps(paper.get("extracted_keywords", []))
                    if isinstance(paper.get("extracted_keywords"), list)
                    else paper.get("extracted_keywords", "[]")
                ),
                "createdAt": datetime.now(timezone.utc),
                "source": paper.get("source", "arxiv"),
            }
            return upsert_document("papers", doc_id, data)
        except Exception as e:
            logger.error(f"Firestore save failed for paper {paper.get('paper_id')}: {e}")
            return False

    def list_all(self, theme_id: str = None) -> List[Dict[str, Any]]:
        try:
            from firestore_client import get_db
            db = get_db()
            query = db.collection("papers")
            if theme_id:
                query = query.where("theme_id", "==", theme_id)

            docs = query.stream()
            results = []
            for doc in docs:
                d = doc.to_dict()
                results.append({
                    "id": d.get("id") or doc.id,
                    "paper_id": d.get("paper_id"),
                    "title": d.get("title"),
                    "url": d.get("url"),
                    "authors": d.get("authors"),
                    "published_at": d.get("published_at"),
                    "abstract": d.get("abstract"),
                    "extracted_keywords": d.get("extracted_keywords"),
                    "source": d.get("source"),
                    "theme_id": d.get("theme_id"),
                    "created_at": d.get("createdAt"),
                })
            return results
        except Exception as e:
            logger.error(f"Firestore list_all failed: {e}")
            return []


def get_paper_repository(session_factory=None) -> PaperRepository:
    """Factory: returns SQLite repo for local/test, Firestore repo for production."""
    from . import use_sqlite
    if use_sqlite():
        logger.debug("PaperRepository: using SQLitePaperRepository")
        return SQLitePaperRepository(session_factory=session_factory)
    else:
        app_env = os.getenv("APP_ENV", "local")
        logger.debug(f"PaperRepository: using FirestorePaperRepository (APP_ENV={app_env})")
        return FirestorePaperRepository()
