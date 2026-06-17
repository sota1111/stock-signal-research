import logging
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class ScoreRepository(ABC):
    @abstractmethod
    def get_by_theme(self, theme_id: str) -> Optional[Dict[str, Any]]:
        ...

    @abstractmethod
    def list_top(self, limit: int = 10) -> List[Dict[str, Any]]:
        ...

    @abstractmethod
    def save(self, score_data: Dict[str, Any]) -> bool:
        ...


class SQLiteScoreRepository(ScoreRepository):
    def __init__(self, session_factory=None):
        from app.database import SessionLocal
        self._session_factory = session_factory or SessionLocal

    def get_by_theme(self, theme_id: str) -> Optional[Dict[str, Any]]:
        from app.models import AlignmentScore
        db = self._session_factory()
        try:
            score = db.query(AlignmentScore).filter(AlignmentScore.theme_id == theme_id).first()
            return self._to_dict(score) if score else None
        finally:
            db.close()

    def list_top(self, limit: int = 10) -> List[Dict[str, Any]]:
        from app.models import AlignmentScore
        db = self._session_factory()
        try:
            scores = db.query(AlignmentScore).order_by(AlignmentScore.score.desc()).limit(limit).all()
            return [self._to_dict(s) for s in scores]
        finally:
            db.close()

    def save(self, score_data: Dict[str, Any]) -> bool:
        from app.models import AlignmentScore
        db = self._session_factory()
        try:
            theme_id = score_data.get("theme_id")
            existing = db.query(AlignmentScore).filter(AlignmentScore.theme_id == theme_id).first()
            if existing:
                for key, value in score_data.items():
                    if hasattr(existing, key):
                        setattr(existing, key, value)
            else:
                if not score_data.get("id"):
                    score_data["id"] = str(uuid.uuid4())
                db.add(AlignmentScore(**score_data))
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            logger.error(f"SQLite save score failed: {e}")
            return False
        finally:
            db.close()

    def _to_dict(self, s) -> Dict[str, Any]:
        return {
            "id": s.id,
            "theme_id": s.theme_id,
            "score": s.score,
            "news_score": s.news_score,
            "announcement_score": s.announcement_score,
            "earnings_score": s.earnings_score,
            "confidence": s.confidence,
            "evidence_count": s.evidence_count,
            "calculated_at": s.calculated_at,
        }


class FirestoreScoreRepository(ScoreRepository):
    def get_by_theme(self, theme_id: str) -> Optional[Dict[str, Any]]:
        try:
            from firestore_client import get_db
            db = get_db()
            doc = db.collection("scores").document(theme_id).get()
            return self._to_dict(doc.to_dict()) if doc.exists else None
        except Exception as e:
            logger.error(f"Firestore get_by_theme failed: {e}")
            return None

    def list_top(self, limit: int = 10) -> List[Dict[str, Any]]:
        try:
            from firestore_client import get_db
            from google.cloud import firestore
            db = get_db()
            docs = db.collection("scores").order_by("score", direction=firestore.Query.DESCENDING).limit(limit).stream()
            return [self._to_dict(doc.to_dict()) for doc in docs]
        except Exception as e:
            logger.error(f"Firestore list_top scores failed: {e}")
            return []

    def save(self, score_data: Dict[str, Any]) -> bool:
        try:
            from firestore_client import upsert_document
            theme_id = score_data.get("theme_id")
            if not theme_id:
                return False

            data = {
                **score_data,
                "updatedAt": datetime.now(timezone.utc),
            }
            data.pop("_sa_instance_state", None)
            return upsert_document("scores", theme_id, data)
        except Exception as e:
            logger.error(f"Firestore save score failed: {e}")
            return False

    def _to_dict(self, d: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": d.get("id") or d.get("theme_id"),
            "theme_id": d.get("theme_id"),
            "score": d.get("score", 0.0),
            "news_score": d.get("news_score", 0.0),
            "announcement_score": d.get("announcement_score", 0.0),
            "earnings_score": d.get("earnings_score", 0.0),
            "confidence": d.get("confidence", 0.0),
            "evidence_count": d.get("evidence_count", 0),
            "calculated_at": d.get("updatedAt"),  # or calculated_at
        }


def get_score_repository(session_factory=None) -> ScoreRepository:
    from . import use_sqlite
    if use_sqlite():
        return SQLiteScoreRepository(session_factory=session_factory)
    return FirestoreScoreRepository()
