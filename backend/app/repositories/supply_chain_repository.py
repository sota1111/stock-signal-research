import logging
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class SupplyChainRepository(ABC):
    @abstractmethod
    def list_all(self) -> List[Dict[str, Any]]:
        ...

    @abstractmethod
    def save(self, sc_data: Dict[str, Any]) -> bool:
        ...


class SQLiteSupplyChainRepository(SupplyChainRepository):
    def list_all(self) -> List[Dict[str, Any]]:
        from app.database import SessionLocal
        from app.models import SupplyChain
        db = SessionLocal()
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
                }
                for sc in scs
            ]
        finally:
            db.close()

    def save(self, sc_data: Dict[str, Any]) -> bool:
        from app.database import SessionLocal
        from app.models import SupplyChain
        db = SessionLocal()
        try:
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


def get_supply_chain_repository() -> SupplyChainRepository:
    app_env = os.getenv("APP_ENV", "local")
    if app_env == "local":
        return SQLiteSupplyChainRepository()
    return FirestoreSupplyChainRepository()
