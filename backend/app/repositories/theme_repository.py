import logging
import os
import json
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class ThemeRepository(ABC):
    @abstractmethod
    def list_all(self) -> List[Dict[str, Any]]:
        ...

    @abstractmethod
    def get_by_id(self, theme_id: str) -> Optional[Dict[str, Any]]:
        ...

    @abstractmethod
    def save(self, theme_data: Dict[str, Any]) -> bool:
        ...

    @abstractmethod
    def delete(self, theme_id: str) -> bool:
        ...

    @abstractmethod
    def list_external_infos_by_theme(self, theme_id: str, info_type: str = None) -> List[Dict[str, Any]]:
        ...

class SQLiteThemeRepository(ThemeRepository):
    def list_all(self) -> List[Dict[str, Any]]:
        from app.database import SessionLocal
        from app.models import Theme
        db = SessionLocal()
        try:
            themes = db.query(Theme).order_by(Theme.precursor_score.desc()).all()
            return [self._to_dict(t) for t in themes]
        finally:
            db.close()

    def get_by_id(self, theme_id: str) -> Optional[Dict[str, Any]]:
        from app.database import SessionLocal
        from app.models import Theme
        db = SessionLocal()
        try:
            theme = db.query(Theme).filter(Theme.id == theme_id).first()
            return self._to_dict(theme) if theme else None
        finally:
            db.close()

    def save(self, theme_data: Dict[str, Any]) -> bool:
        from app.database import SessionLocal
        from app.models import Theme
        db = SessionLocal()
        try:
            theme_id = theme_data.get("id")
            if theme_id:
                theme = db.query(Theme).filter(Theme.id == theme_id).first()
                if theme:
                    for key, value in theme_data.items():
                        if hasattr(theme, key):
                            setattr(theme, key, value)
                else:
                    theme = Theme(**theme_data)
                    db.add(theme)
            else:
                theme_data["id"] = str(uuid.uuid4())
                theme = Theme(**theme_data)
                db.add(theme)
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            logger.error(f"SQLite save theme failed: {e}")
            return False
        finally:
            db.close()

    def delete(self, theme_id: str) -> bool:
        from app.database import SessionLocal
        from app.models import Theme
        db = SessionLocal()
        try:
            theme = db.query(Theme).filter(Theme.id == theme_id).first()
            if theme:
                db.delete(theme)
                db.commit()
                return True
            return False
        except Exception as e:
            db.rollback()
            logger.error(f"SQLite delete theme failed: {e}")
            return False
        finally:
            db.close()

    def list_external_infos_by_theme(self, theme_id: str, info_type: str = None) -> List[Dict[str, Any]]:
        from app.database import SessionLocal
        from app.models import ExternalInfo
        db = SessionLocal()
        try:
            query = db.query(ExternalInfo).filter(ExternalInfo.theme_id == theme_id)
            if info_type:
                query = query.filter(ExternalInfo.info_type == info_type)
            infos = query.all()
            return [
                {
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
                for i in infos
            ]
        finally:
            db.close()

    def _to_dict(self, theme) -> Dict[str, Any]:
        return {
            "id": theme.id,
            "name": theme.name,
            "category": theme.category,
            "description": theme.description,
            "precursor_score": theme.precursor_score,
            "is_trending": theme.is_trending,
            "created_at": theme.created_at,
            "updated_at": theme.updated_at,
        }

class FirestoreThemeRepository(ThemeRepository):
    def list_all(self) -> List[Dict[str, Any]]:
        try:
            from firestore_client import get_db
            from google.cloud import firestore
            db = get_db()
            docs = db.collection("themes").order_by("precursor_score", direction=firestore.Query.DESCENDING).stream()
            return [self._to_dict(doc.to_dict()) for doc in docs]
        except Exception as e:
            logger.error(f"Firestore list_all themes failed: {e}")
            return []

    def get_by_id(self, theme_id: str) -> Optional[Dict[str, Any]]:
        try:
            from firestore_client import get_db
            db = get_db()
            doc = db.collection("themes").document(theme_id).get()
            return self._to_dict(doc.to_dict()) if doc.exists else None
        except Exception as e:
            logger.error(f"Firestore get_by_id theme failed: {e}")
            return None

    def save(self, theme_data: Dict[str, Any]) -> bool:
        try:
            from firestore_client import upsert_document
            if not theme_data.get("id"):
                theme_data["id"] = str(uuid.uuid4())
            
            # Map snake_case to CamelCase if necessary, but task says align with SQLAlchemy
            data = {
                **theme_data,
                "createdAt": theme_data.get("created_at") or datetime.now(timezone.utc),
                "updatedAt": datetime.now(timezone.utc),
            }
            # Remove SQLAlchemy specific keys if present
            data.pop("_sa_instance_state", None)
            
            return upsert_document("themes", data["id"], data)
        except Exception as e:
            logger.error(f"Firestore save theme failed: {e}")
            return False

    def delete(self, theme_id: str) -> bool:
        try:
            from firestore_client import get_db
            db = get_db()
            db.collection("themes").document(theme_id).delete()
            return True
        except Exception as e:
            logger.error(f"Firestore delete theme failed: {e}")
            return False

    def list_external_infos_by_theme(self, theme_id: str, info_type: str = None) -> List[Dict[str, Any]]:
        try:
            from firestore_client import get_db
            db = get_db()
            query = db.collection("news").where("theme_id", "==", theme_id)
            if info_type:
                query = query.where("info_type", "==", info_type)
            docs = query.stream()
            results = []
            for doc in docs:
                d = doc.to_dict()
                results.append({
                    "id": d.get("id") or doc.id,
                    "info_id": d.get("info_id"),
                    "info_type": d.get("info_type"),
                    "title": d.get("title"),
                    "url": d.get("url"),
                    "summary": d.get("summary"),
                    "source_name": d.get("source_name"),
                    "published_at": d.get("published_at"),
                    "related_company": d.get("related_company"),
                    "theme_id": d.get("theme_id"),
                    "relevance_score": d.get("relevance_score"),
                    "created_at": d.get("createdAt"),
                })
            return results
        except Exception as e:
            logger.error(f"Firestore list_external_infos_by_theme failed: {e}")
            return []

    def _to_dict(self, d: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": d.get("id"),
            "name": d.get("name"),
            "category": d.get("category"),
            "description": d.get("description"),
            "precursor_score": d.get("precursor_score", 0.0),
            "is_trending": d.get("is_trending", False),
            "created_at": d.get("createdAt"),
            "updated_at": d.get("updatedAt"),
        }

def get_theme_repository() -> ThemeRepository:
    app_env = os.getenv("APP_ENV", "local")
    if app_env == "local":
        return SQLiteThemeRepository()
    return FirestoreThemeRepository()
