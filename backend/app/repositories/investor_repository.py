import logging
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class InvestorRepository(ABC):
    @abstractmethod
    def list_all(self) -> List[Dict[str, Any]]:
        ...

    @abstractmethod
    def save(self, investor_data: Dict[str, Any]) -> bool:
        ...


class SQLiteInvestorRepository(InvestorRepository):
    def __init__(self, session_factory=None):
        from app.database import SessionLocal
        self._session_factory = session_factory or SessionLocal

    def list_all(self) -> List[Dict[str, Any]]:
        from app.models import InstitutionalInvestor
        db = self._session_factory()
        try:
            investors = db.query(InstitutionalInvestor).all()
            return [
                {
                    "id": i.id,
                    "investor_name": i.investor_name,
                    "company_id": i.company_id,
                    "ownership_pct": i.ownership_pct,
                    "change_pct": i.change_pct,
                    "report_date": i.report_date,
                    "report_type": i.report_type,
                    "notes": i.notes,
                }
                for i in investors
            ]
        finally:
            db.close()

    def save(self, investor_data: Dict[str, Any]) -> bool:
        from app.models import InstitutionalInvestor
        db = self._session_factory()
        try:
            investor_id = investor_data.get("id")
            if investor_id:
                existing = db.query(InstitutionalInvestor).filter(InstitutionalInvestor.id == investor_id).first()
                if existing:
                    for key, value in investor_data.items():
                        if hasattr(existing, key):
                            setattr(existing, key, value)
                else:
                    db.add(InstitutionalInvestor(**investor_data))
            else:
                investor_data["id"] = str(uuid.uuid4())
                db.add(InstitutionalInvestor(**investor_data))
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            logger.error(f"SQLite save investor failed: {e}")
            return False
        finally:
            db.close()


class FirestoreInvestorRepository(InvestorRepository):
    def list_all(self) -> List[Dict[str, Any]]:
        try:
            from firestore_client import get_db
            db = get_db()
            docs = db.collection("institutional_investors").stream()
            return [
                {
                    "id": d.get("id") or doc.id,
                    "investor_name": d.get("investor_name"),
                    "company_id": d.get("company_id"),
                    "ownership_pct": d.get("ownership_pct", 0.0),
                    "change_pct": d.get("change_pct", 0.0),
                    "report_date": d.get("report_date"),
                    "report_type": d.get("report_type"),
                    "notes": d.get("notes"),
                }
                for doc in docs if (d := doc.to_dict())
            ]
        except Exception as e:
            logger.error(f"Firestore list_all investors failed: {e}")
            return []

    def save(self, investor_data: Dict[str, Any]) -> bool:
        try:
            from firestore_client import upsert_document
            # {investor_name}_{company_id}_{report_date}（スペースはアンダースコアに変換）
            doc_id = investor_data.get("id")
            if not doc_id:
                name = investor_data["investor_name"].replace(" ", "_")
                doc_id = f"{name}_{investor_data['company_id']}_{investor_data['report_date']}"
            investor_data["id"] = doc_id

            data = {
                **investor_data,
                "updatedAt": datetime.now(timezone.utc),
            }
            data.pop("_sa_instance_state", None)
            return upsert_document("institutional_investors", doc_id, data)
        except Exception as e:
            logger.error(f"Firestore save investor failed: {e}")
            return False


def get_investor_repository(session_factory=None) -> InvestorRepository:
    from . import use_sqlite
    if use_sqlite():
        return SQLiteInvestorRepository(session_factory=session_factory)
    return FirestoreInvestorRepository()
