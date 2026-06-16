import os
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

_db = None


def get_db():
    """Firestoreクライアントを取得（シングルトン）"""
    global _db
    if _db is None:
        try:
            from google.cloud import firestore
            project_id = os.getenv("GCP_PROJECT_ID")
            database = os.getenv("FIRESTORE_DATABASE", "(default)")

            if database and database != "(default)":
                _db = firestore.Client(project=project_id, database=database)
            else:
                _db = firestore.Client(project=project_id)

            logger.info(f"Firestore client initialized: project={project_id}, database={database}")
        except Exception as e:
            logger.error(f"Failed to initialize Firestore client: {e}")
            raise
    return _db


def upsert_document(collection: str, doc_id: str, data: Dict[str, Any]) -> bool:
    """冪等にドキュメントを保存（存在すれば更新、なければ作成）"""
    try:
        db = get_db()
        from datetime import datetime, timezone
        data["updatedAt"] = datetime.now(timezone.utc)
        db.collection(collection).document(doc_id).set(data, merge=True)
        return True
    except Exception as e:
        logger.error(f"Failed to upsert {collection}/{doc_id}: {e}")
        return False


def save_job_run(job_run_id: str, job_name: str, status: str, **kwargs):
    """ジョブ実行履歴をFirestoreに保存"""
    try:
        db = get_db()
        from datetime import datetime, timezone
        data = {
            "jobRunId": job_run_id,
            "jobName": job_name,
            "status": status,
            "updatedAt": datetime.now(timezone.utc),
            **kwargs
        }
        db.collection("jobs").document(job_run_id).set(data, merge=True)
    except Exception as e:
        logger.error(f"Failed to save job run {job_run_id}: {e}")
