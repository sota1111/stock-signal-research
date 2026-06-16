import logging
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class StockPriceRepository(ABC):
    @abstractmethod
    def list_by_ticker(self, ticker: str, start: Optional[str] = None, end: Optional[str] = None) -> List[Dict[str, Any]]:
        ...

    @abstractmethod
    def get_price_on_or_after(self, ticker: str, date: str) -> Optional[Dict[str, Any]]:
        ...

    @abstractmethod
    def save_many(self, prices: List[Dict[str, Any]]) -> bool:
        ...


class SQLiteStockPriceRepository(StockPriceRepository):
    def list_by_ticker(self, ticker: str, start: Optional[str] = None, end: Optional[str] = None) -> List[Dict[str, Any]]:
        from app.database import SessionLocal
        from app.models import StockPrice
        db = SessionLocal()
        try:
            query = db.query(StockPrice).filter(StockPrice.ticker == ticker)
            if start:
                query = query.filter(StockPrice.date >= start)
            if end:
                query = query.filter(StockPrice.date <= end)
            prices = query.order_by(StockPrice.date.asc()).all()
            return [self._to_dict(p) for p in prices]
        finally:
            db.close()

    def get_price_on_or_after(self, ticker: str, date: str) -> Optional[Dict[str, Any]]:
        from app.database import SessionLocal
        from app.models import StockPrice
        db = SessionLocal()
        try:
            price = db.query(StockPrice).filter(
                StockPrice.ticker == ticker,
                StockPrice.date >= date
            ).order_by(StockPrice.date.asc()).first()
            return self._to_dict(price) if price else None
        finally:
            db.close()

    def save_many(self, prices: List[Dict[str, Any]]) -> bool:
        from app.database import SessionLocal
        from app.models import StockPrice
        db = SessionLocal()
        try:
            for p_data in prices:
                if not p_data.get("id"):
                    p_data["id"] = str(uuid.uuid4())
                db_price = StockPrice(**p_data)
                db.add(db_price)
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            logger.error(f"SQLite save_many stock prices failed: {e}")
            return False
        finally:
            db.close()

    def _to_dict(self, p) -> Dict[str, Any]:
        return {
            "id": p.id,
            "ticker": p.ticker,
            "date": p.date,
            "close": p.close,
            "company_id": p.company_id,
        }


class FirestoreStockPriceRepository(StockPriceRepository):
    def list_by_ticker(self, ticker: str, start: Optional[str] = None, end: Optional[str] = None) -> List[Dict[str, Any]]:
        try:
            from firestore_client import get_db
            db = get_db()
            query = db.collection("stock_prices").where("ticker", "==", ticker)
            if start:
                query = query.where("date", ">=", start)
            if end:
                query = query.where("date", "<=", end)
            
            # Firestore requires index for multi-field where + order_by. 
            # For simplicity in this worker task, we'll sort in memory if needed or assume single field.
            docs = query.stream()
            results = [self._to_dict(doc.to_dict()) for doc in docs]
            results.sort(key=lambda x: x["date"])
            return results
        except Exception as e:
            logger.error(f"Firestore list_by_ticker failed: {e}")
            return []

    def get_price_on_or_after(self, ticker: str, date: str) -> Optional[Dict[str, Any]]:
        try:
            from firestore_client import get_db
            db = get_db()
            # Simplistic approach: get some docs and find the earliest
            docs = db.collection("stock_prices") \
                .where("ticker", "==", ticker) \
                .where("date", ">=", date) \
                .order_by("date") \
                .limit(1) \
                .get()
            
            if docs:
                return self._to_dict(docs[0].to_dict())
            return None
        except Exception as e:
            logger.error(f"Firestore get_price_on_or_after failed: {e}")
            return None

    def save_many(self, prices: List[Dict[str, Any]]) -> bool:
        try:
            from firestore_client import get_db
            db = get_db()
            batch = db.batch()
            for p_data in prices:
                if not p_data.get("id"):
                    p_data["id"] = str(uuid.uuid4())
                
                doc_ref = db.collection("stock_prices").document(p_data["id"])
                data = {
                    **p_data,
                    "updatedAt": datetime.now(timezone.utc)
                }
                data.pop("_sa_instance_state", None)
                batch.set(doc_ref, data)
            
            batch.commit()
            return True
        except Exception as e:
            logger.error(f"Firestore save_many stock prices failed: {e}")
            return False

    def _to_dict(self, d: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": d.get("id"),
            "ticker": d.get("ticker"),
            "date": d.get("date"),
            "close": d.get("close"),
            "company_id": d.get("company_id"),
        }


def get_stock_price_repository() -> StockPriceRepository:
    app_env = os.getenv("APP_ENV", "local")
    if app_env in ("local", "test"):
        return SQLiteStockPriceRepository()
    return FirestoreStockPriceRepository()
