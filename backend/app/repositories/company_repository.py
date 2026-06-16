import logging
import os
import json
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class CompanyRepository(ABC):
    @abstractmethod
    def list_all(self) -> List[Dict[str, Any]]:
        ...

    @abstractmethod
    def get_by_id(self, company_id: str) -> Optional[Dict[str, Any]]:
        ...

    @abstractmethod
    def save(self, company_data: Dict[str, Any]) -> bool:
        ...

    @abstractmethod
    def delete(self, company_id: str) -> bool:
        ...


class SQLiteCompanyRepository(CompanyRepository):
    def list_all(self) -> List[Dict[str, Any]]:
        from app.database import SessionLocal
        from app.models import Company
        db = SessionLocal()
        try:
            companies = db.query(Company).order_by(Company.benefit_score.desc()).all()
            return [self._to_dict(c) for c in companies]
        finally:
            db.close()

    def get_by_id(self, company_id: str) -> Optional[Dict[str, Any]]:
        from app.database import SessionLocal
        from app.models import Company
        db = SessionLocal()
        try:
            company = db.query(Company).filter(Company.id == company_id).first()
            return self._to_dict(company) if company else None
        finally:
            db.close()

    def save(self, company_data: Dict[str, Any]) -> bool:
        from app.database import SessionLocal
        from app.models import Company
        db = SessionLocal()
        try:
            company_id = company_data.get("id")
            if company_id:
                company = db.query(Company).filter(Company.id == company_id).first()
                if company:
                    for key, value in company_data.items():
                        if key == "theme_ids" and isinstance(value, list):
                            value = json.dumps(value)
                        if hasattr(company, key):
                            setattr(company, key, value)
                else:
                    if "theme_ids" in company_data and isinstance(company_data["theme_ids"], list):
                        company_data["theme_ids"] = json.dumps(company_data["theme_ids"])
                    company = Company(**company_data)
                    db.add(company)
            else:
                company_data["id"] = str(uuid.uuid4())
                if "theme_ids" in company_data and isinstance(company_data["theme_ids"], list):
                    company_data["theme_ids"] = json.dumps(company_data["theme_ids"])
                company = Company(**company_data)
                db.add(company)
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            logger.error(f"SQLite save company failed: {e}")
            return False
        finally:
            db.close()

    def delete(self, company_id: str) -> bool:
        from app.database import SessionLocal
        from app.models import Company
        db = SessionLocal()
        try:
            company = db.query(Company).filter(Company.id == company_id).first()
            if company:
                db.delete(company)
                db.commit()
                return True
            return False
        except Exception as e:
            db.rollback()
            logger.error(f"SQLite delete company failed: {e}")
            return False
        finally:
            db.close()

    def _to_dict(self, c) -> Dict[str, Any]:
        return {
            "id": c.id,
            "name": c.name,
            "ticker": c.ticker,
            "description": c.description,
            "benefit_score": c.benefit_score,
            "benefit_type": c.benefit_type,
            "theme_ids": c.theme_ids,
        }


class FirestoreCompanyRepository(CompanyRepository):
    def list_all(self) -> List[Dict[str, Any]]:
        try:
            from firestore_client import get_db
            from google.cloud import firestore
            db = get_db()
            docs = db.collection("companies").order_by("benefit_score", direction=firestore.Query.DESCENDING).stream()
            return [self._to_dict(doc.to_dict()) for doc in docs]
        except Exception as e:
            logger.error(f"Firestore list_all companies failed: {e}")
            return []

    def get_by_id(self, company_id: str) -> Optional[Dict[str, Any]]:
        try:
            from firestore_client import get_db
            db = get_db()
            doc = db.collection("companies").document(company_id).get()
            return self._to_dict(doc.to_dict()) if doc.exists else None
        except Exception as e:
            logger.error(f"Firestore get_by_id company failed: {e}")
            return None

    def save(self, company_data: Dict[str, Any]) -> bool:
        try:
            from firestore_client import upsert_document
            if not company_data.get("id"):
                company_data["id"] = str(uuid.uuid4())

            data = {
                **company_data,
                "createdAt": datetime.now(timezone.utc),
                "updatedAt": datetime.now(timezone.utc),
            }
            if "theme_ids" in data and isinstance(data["theme_ids"], list):
                data["theme_ids"] = json.dumps(data["theme_ids"])

            data.pop("_sa_instance_state", None)
            return upsert_document("companies", data["id"], data)
        except Exception as e:
            logger.error(f"Firestore save company failed: {e}")
            return False

    def delete(self, company_id: str) -> bool:
        try:
            from firestore_client import get_db
            db = get_db()
            db.collection("companies").document(company_id).delete()
            return True
        except Exception as e:
            logger.error(f"Firestore delete company failed: {e}")
            return False

    def _to_dict(self, d: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": d.get("id"),
            "name": d.get("name"),
            "ticker": d.get("ticker"),
            "description": d.get("description"),
            "benefit_score": d.get("benefit_score", 0.0),
            "benefit_type": d.get("benefit_type", "indirect"),
            "theme_ids": d.get("theme_ids"),
        }


def get_company_repository() -> CompanyRepository:
    app_env = os.getenv("APP_ENV", "local")
    if app_env in ("local", "test"):
        return SQLiteCompanyRepository()
    return FirestoreCompanyRepository()
