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

    @abstractmethod
    def save_many(self, investors_data: List[Dict[str, Any]]) -> int:
        ...

    @abstractmethod
    def delete_all(self) -> int:
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
                    "cusip": i.cusip,
                    "ticker": i.ticker,
                    "shares": i.shares,
                    "value_usd": i.value_usd,
                    "quarter_delta": i.quarter_delta,
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

    def save_many(self, investors_data: List[Dict[str, Any]]) -> int:
        from app.models import InstitutionalInvestor
        db = self._session_factory()
        saved = 0
        try:
            for investor_data in investors_data:
                row = dict(investor_data)
                if not row.get("id"):
                    row["id"] = str(uuid.uuid4())
                db.merge(InstitutionalInvestor(**row))
                saved += 1
            db.commit()
            return saved
        except Exception as e:
            db.rollback()
            logger.error(f"SQLite save_many investors failed: {e}")
            return 0
        finally:
            db.close()

    def delete_all(self) -> int:
        from app.models import InstitutionalInvestor
        db = self._session_factory()
        try:
            deleted = db.query(InstitutionalInvestor).delete()
            db.commit()
            return int(deleted or 0)
        except Exception as e:
            db.rollback()
            logger.error(f"SQLite delete_all investors failed: {e}")
            return 0
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
                    "cusip": d.get("cusip"),
                    "ticker": d.get("ticker"),
                    "shares": d.get("shares"),
                    "value_usd": d.get("value_usd"),
                    "quarter_delta": d.get("quarter_delta"),
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

    @staticmethod
    def _doc_id_for(investor_data: Dict[str, Any]) -> str:
        # {investor_name}_{company_id}_{report_date}（スペースはアンダースコアに変換）
        doc_id = investor_data.get("id")
        if not doc_id:
            name = investor_data["investor_name"].replace(" ", "_")
            doc_id = f"{name}_{investor_data['company_id']}_{investor_data['report_date']}"
        return doc_id

    def save_many(self, investors_data: List[Dict[str, Any]]) -> int:
        """複数の投資家レコードを WriteBatch でまとめて冪等 upsert する(SOT-1201)。

        本番シードは13Fの実データ約2000件を投入するが、1件ずつの `.set()` は
        1書き込み=1往復のため、Cloud Run のバックグラウンドスレッド(CPUスロットリング下)で
        完了する前にインスタンスがスケールゼロし、旧データが洗い替えされずに残っていた。
        バッチ化で往復を約1/500に圧縮し、確実に投入されるようにする。"""
        try:
            from firestore_client import batch_upsert_documents

            items = []
            for investor_data in investors_data:
                doc_id = self._doc_id_for(investor_data)
                data = dict(investor_data)
                data["id"] = doc_id
                data.pop("_sa_instance_state", None)
                items.append((doc_id, data))
            return batch_upsert_documents("institutional_investors", items)
        except Exception as e:
            logger.error(f"Firestore save_many investors failed: {e}")
            return 0

    def delete_all(self) -> int:
        try:
            from firestore_client import get_db
            db = get_db()
            coll = db.collection("institutional_investors")
            deleted = 0
            batch = db.batch()
            ops = 0
            for doc in coll.stream():
                batch.delete(doc.reference)
                ops += 1
                deleted += 1
                if ops >= 400:  # Firestore batch limit is 500; stay well under it.
                    batch.commit()
                    batch = db.batch()
                    ops = 0
            if ops:
                batch.commit()
            return deleted
        except Exception as e:
            logger.error(f"Firestore delete_all investors failed: {e}")
            return 0


def get_investor_repository(session_factory=None) -> InvestorRepository:
    from . import use_sqlite
    if use_sqlite():
        return SQLiteInvestorRepository(session_factory=session_factory)
    return FirestoreInvestorRepository()
