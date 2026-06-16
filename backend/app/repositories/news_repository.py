import logging
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class NewsRepository(ABC):
    @abstractmethod
    def list_all(self, theme_id: str = None, info_type: str = None, limit: int = 50) -> List[Dict[str, Any]]:
        ...

    @abstractmethod
    def save(self, info_data: Dict[str, Any]) -> bool:
        ...


class SQLiteNewsRepository(NewsRepository):
    def list_all(self, theme_id: str = None, info_type: str = None, limit: int = 50) -> List[Dict[str, Any]]:
        from app.database import SessionLocal
        from app.models import ExternalInfo
        db = SessionLocal()
        try:
            query = db.query(ExternalInfo)
            if theme_id:
                query = query.filter(ExternalInfo.theme_id == theme_id)
            if info_type:
                query = query.filter(ExternalInfo.info_type == info_type)

            infos = query.order_by(ExternalInfo.created_at.desc()).limit(limit).all()
            return [self._to_dict(i) for i in infos]
        finally:
            db.close()

    def save(self, info_data: Dict[str, Any]) -> bool:
        from app.database import SessionLocal
        from app.models import ExternalInfo
        db = SessionLocal()
        try:
            info_id = info_data.get("info_id")
            existing = db.query(ExternalInfo).filter(ExternalInfo.info_id == info_id).first()
            if existing:
                for key, value in info_data.items():
                    if hasattr(existing, key):
                        setattr(existing, key, value)
            else:
                if not info_data.get("id"):
                    info_data["id"] = str(uuid.uuid4())
                new_info = ExternalInfo(**info_data)
                db.add(new_info)
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            logger.error(f"SQLite save news failed: {e}")
            return False
        finally:
            db.close()

    def _to_dict(self, i) -> Dict[str, Any]:
        return {
            "id": i.id,
            "info_id": i.info_id,
            "info_type": i.info_type,
            "title": i.title,
            "url": i.url,
            "summary": i.summary,
            "source_name": i.source_name,
            "published_at": i.published_at,
            "related_company": i.related_company,
            "theme_id": i.theme_id,
            "relevance_score": i.relevance_score,
            "created_at": i.created_at,
        }


class FirestoreNewsRepository(NewsRepository):
    def list_all(self, theme_id: str = None, info_type: str = None, limit: int = 50) -> List[Dict[str, Any]]:
        try:
            from firestore_client import get_db
            from google.cloud import firestore
            db = get_db()
            query = db.collection("news")

            if theme_id:
                query = query.where("theme_id", "==", theme_id)
            if info_type:
                query = query.where("info_type", "==", info_type)

            # Note: Composite index might be needed for where + order_by
            docs = query.order_by("createdAt", direction=firestore.Query.DESCENDING).limit(limit).stream()
            return [self._to_dict(doc.to_dict()) for doc in docs]
        except Exception as e:
            logger.error(f"Firestore list_all news failed: {e}")
            # Fallback if index is missing: just limit without order_by or filter?
            # For now, let's assume index exists or it's handled.
            return []

    def save(self, info_data: Dict[str, Any]) -> bool:
        try:
            from firestore_client import upsert_document
            doc_id = info_data.get("info_id")
            if not doc_id:
                return False

            data = {
                **info_data,
                "createdAt": info_data.get("created_at") or datetime.now(timezone.utc),
                "updatedAt": datetime.now(timezone.utc),
            }
            data.pop("_sa_instance_state", None)
            return upsert_document("news", doc_id, data)
        except Exception as e:
            logger.error(f"Firestore save news failed: {e}")
            return False

    def _to_dict(self, d: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": d.get("id"),
            "info_id": d.get("info_id"),
            "info_type": d.get("info_type"),
            "title": d.get("title"),
            "url": d.get("url"),
            "summary": d.get("summary"),
            "source_name": d.get("source_name"),
            "published_at": d.get("published_at"),
            "related_company": d.get("related_company"),
            "theme_id": d.get("theme_id"),
            "relevance_score": d.get("relevance_score", 0.0),
            "created_at": d.get("createdAt"),
        }


def get_news_repository() -> NewsRepository:
    app_env = os.getenv("APP_ENV", "local")
    if app_env == "local":
        return SQLiteNewsRepository()
    return FirestoreNewsRepository()
