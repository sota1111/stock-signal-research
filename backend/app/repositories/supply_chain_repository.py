import json
import logging
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


def _decode_evidence(value: Any) -> List[str]:
    """evidence は SQLite では JSON 文字列、Firestore では list で保持されうる。常に list[str] に正規化する。"""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return []
        try:
            decoded = json.loads(value)
            if isinstance(decoded, list):
                return [str(v) for v in decoded]
            return [str(decoded)]
        except (ValueError, TypeError):
            return [value]
    return []


class SupplyChainRepository(ABC):
    @abstractmethod
    def list_all(self) -> List[Dict[str, Any]]:
        ...

    @abstractmethod
    def save(self, sc_data: Dict[str, Any]) -> bool:
        ...


class SQLiteSupplyChainRepository(SupplyChainRepository):
    def __init__(self, session_factory=None):
        from app.database import SessionLocal
        self._session_factory = session_factory or SessionLocal

    def list_all(self) -> List[Dict[str, Any]]:
        from app.models import SupplyChain
        db = self._session_factory()
        try:
            scs = db.query(SupplyChain).order_by(SupplyChain.order.asc()).all()
            return [
                {
                    "id": sc.id,
                    "from_theme_id": sc.from_theme_id,
                    "to_theme_id": sc.to_theme_id,
                    "relationship": sc.relationship,
                    "description": sc.description,
                    "order": sc.order,
                    "relation_type": sc.relation_type or "depends_on",
                    "confidence": sc.confidence if sc.confidence is not None else 0.5,
                    "evidence": _decode_evidence(sc.evidence),
                    "created_at": sc.created_at,
                }
                for sc in scs
            ]
        finally:
            db.close()

    def save(self, sc_data: Dict[str, Any]) -> bool:
        from app.models import SupplyChain
        db = self._session_factory()
        try:
            sc_data = dict(sc_data)
            # evidence は list で受け取り、SQLite には JSON 文字列で保存する
            if isinstance(sc_data.get("evidence"), list):
                sc_data["evidence"] = json.dumps(sc_data["evidence"], ensure_ascii=False)
            sc_id = sc_data.get("id")
            if sc_id:
                existing = db.query(SupplyChain).filter(SupplyChain.id == sc_id).first()
                if existing:
                    for key, value in sc_data.items():
                        if hasattr(existing, key):
                            setattr(existing, key, value)
                else:
                    db.add(SupplyChain(**sc_data))
            else:
                sc_data["id"] = str(uuid.uuid4())
                db.add(SupplyChain(**sc_data))
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            logger.error(f"SQLite save supply_chain failed: {e}")
            return False
        finally:
            db.close()


class FirestoreSupplyChainRepository(SupplyChainRepository):
    def list_all(self) -> List[Dict[str, Any]]:
        try:
            from firestore_client import get_db
            db = get_db()
            docs = db.collection("supply_chains").order_by("order").stream()
            return [
                {
                    "id": d.get("id") or doc.id,
                    "from_theme_id": d.get("from_theme_id"),
                    "to_theme_id": d.get("to_theme_id"),
                    "relationship": d.get("relationship"),
                    "description": d.get("description"),
                    "order": d.get("order", 0),
                    "relation_type": d.get("relation_type") or "depends_on",
                    "confidence": d.get("confidence", 0.5),
                    "evidence": _decode_evidence(d.get("evidence")),
                    "created_at": d.get("created_at"),
                }
                for doc in docs if (d := doc.to_dict())
            ]
        except Exception as e:
            logger.error(f"Firestore list_all supply_chains failed: {e}")
            return []

    def save(self, sc_data: Dict[str, Any]) -> bool:
        try:
            from firestore_client import upsert_document
            doc_id = sc_data.get("id") or f"{sc_data['from_theme_id']}_{sc_data['to_theme_id']}"
            sc_data["id"] = doc_id

            data = {
                **sc_data,
                "updatedAt": datetime.now(timezone.utc),
            }
            data.pop("_sa_instance_state", None)
            return upsert_document("supply_chains", doc_id, data)
        except Exception as e:
            logger.error(f"Firestore save supply_chain failed: {e}")
            return False


def get_supply_chain_repository(session_factory=None) -> SupplyChainRepository:
    from . import use_sqlite
    if use_sqlite():
        return SQLiteSupplyChainRepository(session_factory=session_factory)
    return FirestoreSupplyChainRepository()
