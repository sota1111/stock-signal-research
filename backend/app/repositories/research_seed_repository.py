import json
import logging
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

_CONFIDENCE_ORDER = {"high": 0, "medium": 1, "low": 2}


def _loads(value, default):
    if value is None or value == "":
        return default
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default


class ResearchSeedRepository(ABC):
    @abstractmethod
    def list_all(self) -> List[Dict[str, Any]]:
        ...

    @abstractmethod
    def save(self, seed_data: Dict[str, Any]) -> bool:
        ...


class SQLiteResearchSeedRepository(ResearchSeedRepository):
    def __init__(self, session_factory=None):
        from app.database import SessionLocal
        self._session_factory = session_factory or SessionLocal

    def list_all(self) -> List[Dict[str, Any]]:
        from app.models import ResearchSeed
        db = self._session_factory()
        try:
            seeds = db.query(ResearchSeed).all()
            result = [self._to_dict(s) for s in seeds]
            result.sort(key=lambda x: (_CONFIDENCE_ORDER.get(x.get("confidence"), 9), x.get("theme") or ""))
            return result
        finally:
            db.close()

    def save(self, seed_data: Dict[str, Any]) -> bool:
        from app.models import ResearchSeed
        db = self._session_factory()
        try:
            data = self._encode(seed_data)
            seed_id = data.get("seed_id")
            existing = None
            if seed_id:
                existing = db.query(ResearchSeed).filter(ResearchSeed.seed_id == seed_id).first()
            if existing:
                for key, value in data.items():
                    if hasattr(existing, key):
                        setattr(existing, key, value)
            else:
                if not data.get("id"):
                    data["id"] = str(uuid.uuid4())
                db.add(ResearchSeed(**data))
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            logger.error(f"SQLite save research_seed failed: {e}")
            return False
        finally:
            db.close()

    @staticmethod
    def _encode(seed_data: Dict[str, Any]) -> Dict[str, Any]:
        data = dict(seed_data)
        for key in ("related_keywords", "papers", "stock_events"):
            if key in data and not isinstance(data[key], str):
                data[key] = json.dumps(data[key], ensure_ascii=False)
        return data

    def _to_dict(self, s) -> Dict[str, Any]:
        return {
            "id": s.id,
            "seed_id": s.seed_id,
            "source_type": s.source_type,
            "source_reference": s.source_reference,
            "symbol": s.symbol,
            "company_name": s.company_name,
            "theme": s.theme,
            "related_keywords": _loads(s.related_keywords, []),
            "summary": s.summary,
            "papers": _loads(s.papers, []),
            "stock_events": _loads(s.stock_events, []),
            "hypothesis": s.hypothesis,
            "reason_to_track": s.reason_to_track,
            "confidence": s.confidence,
            "created_at": s.seed_created_at,
            "updated_at": s.seed_updated_at,
        }


class FirestoreResearchSeedRepository(ResearchSeedRepository):
    def list_all(self) -> List[Dict[str, Any]]:
        try:
            from firestore_client import get_db
            db = get_db()
            docs = db.collection("research_seeds").stream()
            result = [self._to_dict(doc.to_dict()) for doc in docs]
            result.sort(key=lambda x: (_CONFIDENCE_ORDER.get(x.get("confidence"), 9), x.get("theme") or ""))
            return result
        except Exception as e:
            logger.error(f"Firestore list_all research_seeds failed: {e}")
            return []

    def save(self, seed_data: Dict[str, Any]) -> bool:
        try:
            from firestore_client import upsert_document
            data = dict(seed_data)
            # Decode JSON-string list fields so Firestore stores native arrays.
            for key in ("related_keywords", "papers", "stock_events"):
                if isinstance(data.get(key), str):
                    data[key] = _loads(data[key], [])
            if not data.get("id"):
                data["id"] = str(uuid.uuid4())
            doc_id = data.get("seed_id") or data["id"]
            data["updatedAt"] = datetime.now(timezone.utc)
            data.pop("_sa_instance_state", None)
            return upsert_document("research_seeds", doc_id, data)
        except Exception as e:
            logger.error(f"Firestore save research_seed failed: {e}")
            return False

    def _to_dict(self, d: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": d.get("id"),
            "seed_id": d.get("seed_id"),
            "source_type": d.get("source_type"),
            "source_reference": d.get("source_reference"),
            "symbol": d.get("symbol"),
            "company_name": d.get("company_name"),
            "theme": d.get("theme"),
            "related_keywords": _loads(d.get("related_keywords"), []),
            "summary": d.get("summary"),
            "papers": _loads(d.get("papers"), []),
            "stock_events": _loads(d.get("stock_events"), []),
            "hypothesis": d.get("hypothesis"),
            "reason_to_track": d.get("reason_to_track"),
            "confidence": d.get("confidence"),
            "created_at": d.get("seed_created_at"),
            "updated_at": d.get("seed_updated_at"),
        }


def get_research_seed_repository(session_factory=None) -> ResearchSeedRepository:
    from . import use_sqlite
    if use_sqlite():
        return SQLiteResearchSeedRepository(session_factory=session_factory)
    return FirestoreResearchSeedRepository()
