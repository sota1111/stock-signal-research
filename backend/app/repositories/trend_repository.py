import logging
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class TrendRepository(ABC):
    @abstractmethod
    def list_monthly_counts(self, theme_id: str = None, limit: int = 10) -> List[Dict[str, Any]]:
        ...

    @abstractmethod
    def save_monthly_count(self, count_data: Dict[str, Any]) -> bool:
        ...


class SQLiteTrendRepository(TrendRepository):
    def __init__(self, session_factory=None):
        from app.database import SessionLocal
        self._session_factory = session_factory or SessionLocal

    def list_monthly_counts(self, theme_id: str = None, limit: int = 10) -> List[Dict[str, Any]]:
        from app.models import PaperMonthlyCount
        db = self._session_factory()
        try:
            query = db.query(PaperMonthlyCount)
            if theme_id:
                query = query.filter(PaperMonthlyCount.theme_id == theme_id)

            counts = query.order_by(PaperMonthlyCount.mom_change_pct.desc()).limit(limit).all()
            return [
                {
                    "theme_id": c.theme_id,
                    "keyword": c.keyword,
                    "year_month": c.year_month,
                    "count": c.count,
                    "prev_month_count": c.prev_month_count,
                    "prev_year_count": c.prev_year_count,
                    "mom_change_pct": c.mom_change_pct,
                    "yoy_change_pct": c.yoy_change_pct,
                }
                for c in counts
            ]
        finally:
            db.close()

    def save_monthly_count(self, count_data: Dict[str, Any]) -> bool:
        from app.models import PaperMonthlyCount
        db = self._session_factory()
        try:
            theme_id = count_data.get("theme_id")
            keyword = count_data.get("keyword")
            year_month = count_data.get("year_month")

            existing = db.query(PaperMonthlyCount).filter(
                PaperMonthlyCount.theme_id == theme_id,
                PaperMonthlyCount.keyword == keyword,
                PaperMonthlyCount.year_month == year_month
            ).first()

            if existing:
                for key, value in count_data.items():
                    if hasattr(existing, key):
                        setattr(existing, key, value)
            else:
                if not count_data.get("id"):
                    count_data["id"] = str(uuid.uuid4())
                db.add(PaperMonthlyCount(**count_data))
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            logger.error(f"SQLite save monthly count failed: {e}")
            return False
        finally:
            db.close()


class FirestoreTrendRepository(TrendRepository):
    def list_monthly_counts(self, theme_id: str = None, limit: int = 10) -> List[Dict[str, Any]]:
        try:
            from firestore_client import get_db
            from google.cloud import firestore
            db = get_db()
            query = db.collection("paper_monthly_counts")

            if theme_id:
                query = query.where("theme_id", "==", theme_id)

            docs = query.order_by("mom_change_pct", direction=firestore.Query.DESCENDING).limit(limit).stream()
            return [
                {
                    "theme_id": d.get("theme_id"),
                    "keyword": d.get("keyword"),
                    "year_month": d.get("year_month"),
                    "count": d.get("count", 0),
                    "prev_month_count": d.get("prev_month_count", 0),
                    "prev_year_count": d.get("prev_year_count", 0),
                    "mom_change_pct": d.get("mom_change_pct", 0.0),
                    "yoy_change_pct": d.get("yoy_change_pct", 0.0),
                }
                for doc in docs if (d := doc.to_dict())
            ]
        except Exception as e:
            logger.error(f"Firestore list_monthly_counts failed: {e}")
            return []

    def save_monthly_count(self, count_data: Dict[str, Any]) -> bool:
        try:
            from firestore_client import upsert_document
            # {theme_id}_{keyword}_{year_month}
            doc_id = f"{count_data['theme_id']}_{count_data['keyword']}_{count_data['year_month']}"

            data = {
                **count_data,
                "updatedAt": datetime.now(timezone.utc),
            }
            data.pop("_sa_instance_state", None)
            return upsert_document("paper_monthly_counts", doc_id, data)
        except Exception as e:
            logger.error(f"Firestore save monthly count failed: {e}")
            return False


def get_trend_repository(session_factory=None) -> TrendRepository:
    from . import use_sqlite
    if use_sqlite():
        return SQLiteTrendRepository(session_factory=session_factory)
    return FirestoreTrendRepository()
