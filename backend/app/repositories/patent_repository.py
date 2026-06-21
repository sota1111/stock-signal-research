import logging
import os
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


class PatentRepository(ABC):
    @abstractmethod
    def save(self, patent: Dict[str, Any]) -> bool:
        """Save a patent idempotently. Returns True on success."""
        ...

    @abstractmethod
    def list_all(self, theme_id: str = None) -> List[Dict[str, Any]]:
        """List all patents, optionally filtered by theme_id."""
        ...

    @abstractmethod
    def save_yearly_count(self, row: Dict[str, Any]) -> bool:
        """Upsert a theme x year patent count idempotently."""
        ...

    @abstractmethod
    def list_yearly_counts(self, theme_id: str = None) -> List[Dict[str, Any]]:
        """List theme x year patent counts, optionally filtered by theme_id."""
        ...


class SQLitePatentRepository(PatentRepository):
    def __init__(self, session_factory=None):
        from app.database import SessionLocal
        self._session_factory = session_factory or SessionLocal

    def _get_theme_id(self, db, theme_name: str):
        from app.models import Theme
        if not theme_name:
            return None
        theme = db.query(Theme).filter(Theme.name.ilike(theme_name)).first()
        return theme.id if theme else None

    def save(self, patent: Dict[str, Any]) -> bool:
        try:
            from app.models import Patent
            db = self._session_factory()
            try:
                # theme_id may be passed directly (Firestore-style) or resolved from "theme" name.
                theme_id = patent.get("theme_id") or self._get_theme_id(db, patent.get("theme", ""))
                existing = db.query(Patent).filter(Patent.patent_id == patent["patent_id"]).first()
                if existing:
                    existing.patent_number = patent.get("patent_number", existing.patent_number)
                    existing.title = patent.get("title", existing.title)
                    existing.published_at = patent.get("published_at", existing.published_at)
                    existing.assignee = patent.get("assignee", existing.assignee)
                    existing.inventors = patent.get("inventors", existing.inventors)
                    existing.cpc = patent.get("cpc", existing.cpc)
                    existing.kind = patent.get("kind", existing.kind)
                    existing.url = patent.get("url", existing.url)
                    existing.source = patent.get("source", existing.source)
                    if theme_id:
                        existing.theme_id = theme_id
                else:
                    import uuid
                    db.add(Patent(
                        id=patent.get("id") or str(uuid.uuid4()),
                        patent_id=patent["patent_id"],
                        patent_number=patent.get("patent_number"),
                        title=patent.get("title", ""),
                        published_at=patent.get("published_at"),
                        theme_id=theme_id,
                        assignee=patent.get("assignee"),
                        inventors=patent.get("inventors"),
                        cpc=patent.get("cpc"),
                        kind=patent.get("kind"),
                        url=patent.get("url"),
                        source=patent.get("source", "ppubs"),
                    ))
                db.commit()
                return True
            except Exception as e:
                db.rollback()
                logger.error(f"SQLite save failed for patent {patent.get('patent_id')}: {e}")
                return False
            finally:
                db.close()
        except Exception as e:
            logger.error(f"SQLite repository error: {e}")
            return False

    def list_all(self, theme_id: str = None) -> List[Dict[str, Any]]:
        try:
            from app.models import Patent
            db = self._session_factory()
            try:
                query = db.query(Patent)
                if theme_id:
                    query = query.filter(Patent.theme_id == theme_id)
                patents = query.order_by(Patent.published_at.desc()).all()
                return [
                    {
                        "id": p.id,
                        "patent_id": p.patent_id,
                        "patent_number": p.patent_number,
                        "title": p.title,
                        "published_at": p.published_at,
                        "theme_id": p.theme_id,
                        "assignee": p.assignee,
                        "inventors": p.inventors,
                        "cpc": p.cpc,
                        "kind": p.kind,
                        "url": p.url,
                        "source": p.source,
                    }
                    for p in patents
                ]
            finally:
                db.close()
        except Exception as e:
            logger.error(f"SQLite list_all failed: {e}")
            return []

    def save_yearly_count(self, row: Dict[str, Any]) -> bool:
        try:
            from app.models import PatentYearlyCount
            db = self._session_factory()
            try:
                existing = db.query(PatentYearlyCount).filter(
                    PatentYearlyCount.theme_id == row["theme_id"],
                    PatentYearlyCount.year == str(row["year"]),
                ).first()
                if existing:
                    existing.count = row.get("count", existing.count)
                else:
                    import uuid
                    db.add(PatentYearlyCount(
                        id=str(uuid.uuid4()),
                        theme_id=row["theme_id"],
                        year=str(row["year"]),
                        count=row.get("count", 0),
                    ))
                db.commit()
                return True
            except Exception as e:
                db.rollback()
                logger.error(f"SQLite save_yearly_count failed: {e}")
                return False
            finally:
                db.close()
        except Exception as e:
            logger.error(f"SQLite repository error: {e}")
            return False

    def list_yearly_counts(self, theme_id: str = None) -> List[Dict[str, Any]]:
        try:
            from app.models import PatentYearlyCount
            db = self._session_factory()
            try:
                query = db.query(PatentYearlyCount)
                if theme_id:
                    query = query.filter(PatentYearlyCount.theme_id == theme_id)
                rows = query.order_by(PatentYearlyCount.year.asc()).all()
                return [
                    {"theme_id": r.theme_id, "year": r.year, "count": r.count or 0}
                    for r in rows
                ]
            finally:
                db.close()
        except Exception as e:
            logger.error(f"SQLite list_yearly_counts failed: {e}")
            return []


class FirestorePatentRepository(PatentRepository):
    def save(self, patent: Dict[str, Any]) -> bool:
        try:
            from firestore_client import upsert_document
            doc_id = patent["patent_id"].replace("/", "_")
            data = {
                **patent,
                "createdAt": datetime.now(timezone.utc),
                "source": patent.get("source", "ppubs"),
            }
            return upsert_document("patents", doc_id, data)
        except Exception as e:
            logger.error(f"Firestore save failed for patent {patent.get('patent_id')}: {e}")
            return False

    def list_all(self, theme_id: str = None) -> List[Dict[str, Any]]:
        try:
            from firestore_client import get_db
            db = get_db()
            query = db.collection("patents")
            if theme_id:
                query = query.where("theme_id", "==", theme_id)
            results = []
            for doc in query.stream():
                d = doc.to_dict()
                results.append({
                    "id": d.get("id") or doc.id,
                    "patent_id": d.get("patent_id"),
                    "patent_number": d.get("patent_number"),
                    "title": d.get("title"),
                    "published_at": d.get("published_at"),
                    "theme_id": d.get("theme_id"),
                    "assignee": d.get("assignee"),
                    "inventors": d.get("inventors"),
                    "cpc": d.get("cpc"),
                    "kind": d.get("kind"),
                    "url": d.get("url"),
                    "source": d.get("source"),
                })
            results.sort(key=lambda r: r.get("published_at") or "", reverse=True)
            return results
        except Exception as e:
            logger.error(f"Firestore list_all failed: {e}")
            return []

    def save_yearly_count(self, row: Dict[str, Any]) -> bool:
        try:
            from firestore_client import upsert_document
            doc_id = f"{row['theme_id']}_{row['year']}"
            return upsert_document("patent_yearly_counts", doc_id, {
                "theme_id": row["theme_id"],
                "year": str(row["year"]),
                "count": row.get("count", 0),
            })
        except Exception as e:
            logger.error(f"Firestore save_yearly_count failed: {e}")
            return False

    def list_yearly_counts(self, theme_id: str = None) -> List[Dict[str, Any]]:
        try:
            from firestore_client import get_db
            db = get_db()
            query = db.collection("patent_yearly_counts")
            if theme_id:
                query = query.where("theme_id", "==", theme_id)
            results = [
                {"theme_id": d.get("theme_id"), "year": d.get("year"), "count": d.get("count", 0)}
                for d in (doc.to_dict() for doc in query.stream())
            ]
            results.sort(key=lambda r: r.get("year") or "")
            return results
        except Exception as e:
            logger.error(f"Firestore list_yearly_counts failed: {e}")
            return []


def get_patent_repository(session_factory=None) -> PatentRepository:
    """Factory: returns SQLite repo for local/test, Firestore repo for production."""
    from . import use_sqlite
    if use_sqlite():
        logger.debug("PatentRepository: using SQLitePatentRepository")
        return SQLitePatentRepository(session_factory=session_factory)
    app_env = os.getenv("APP_ENV", "local")
    logger.debug(f"PatentRepository: using FirestorePatentRepository (APP_ENV={app_env})")
    return FirestorePatentRepository()
