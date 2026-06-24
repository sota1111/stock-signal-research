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


def batch_upsert_documents(collection: str, items) -> int:
    """複数ドキュメントを WriteBatch でまとめて冪等 upsert する。

    items は (doc_id, data) タプルの反復可能オブジェクト。500件ごと(Firestoreの
    バッチ上限)に commit する。merge=True で `upsert_document` と同じ冪等挙動。

    本番シードは数千〜万件の論文/月次カウントを投入するが、1件ずつの `.set()` は
    1書き込み=1往復のため、Cloud Run のバックグラウンドスレッド(CPUスロットリング下)で
    完了する前にインスタンスがスケールゼロし、データが入りきらなかった。バッチ化で
    往復回数を約1/500に圧縮し、確実に投入されるようにする(SOT-1180)。

    書き込めた件数を返す。例外時はログを出し、その時点までの件数を返す(起動を妨げない)。"""
    written = 0
    try:
        db = get_db()
        from datetime import datetime, timezone
        batch = db.batch()
        pending = 0
        for doc_id, data in items:
            now = datetime.now(timezone.utc)
            doc_ref = db.collection(collection).document(doc_id)
            batch.set(doc_ref, {**data, "updatedAt": now}, merge=True)
            pending += 1
            if pending >= 500:
                batch.commit()
                written += pending
                batch = db.batch()
                pending = 0
        if pending:
            batch.commit()
            written += pending
        return written
    except Exception as e:
        logger.error(f"Failed to batch upsert {collection} ({written} written before error): {e}")
        return written


def delete_document(collection: str, doc_id: str) -> bool:
    """ドキュメントを削除（存在しなくても成功扱い）。冪等な再投入で余剰データを掃除するために使う。"""
    try:
        db = get_db()
        db.collection(collection).document(doc_id).delete()
        return True
    except Exception as e:
        logger.error(f"Failed to delete {collection}/{doc_id}: {e}")
        return False


def batch_delete_documents(collection: str, doc_ids) -> int:
    """複数ドキュメントを WriteBatch でまとめて削除する。

    doc_ids は doc_id 文字列の反復可能オブジェクト。500件ごと(Firestoreのバッチ上限)に
    commit する。存在しない doc の削除は no-op(冪等)。

    本番シードは旧合成doc(数千〜万件)を reconcile で掃除するが、1件ずつの `.delete()` は
    1削除=1往復のため、Cloud Run のバックグラウンドスレッド(CPUスロットリング下)で完了する
    前にインスタンスがスケールゼロし、後続の月次カウント投入に到達できなかった。バッチ化で
    往復回数を約1/500に圧縮する(SOT-1180)。

    削除できた件数を返す。例外時はログを出し、その時点までの件数を返す(起動を妨げない)。"""
    written = 0
    try:
        db = get_db()
        batch = db.batch()
        pending = 0
        for doc_id in doc_ids:
            doc_ref = db.collection(collection).document(doc_id)
            batch.delete(doc_ref)
            pending += 1
            if pending >= 500:
                batch.commit()
                written += pending
                batch = db.batch()
                pending = 0
        if pending:
            batch.commit()
            written += pending
        return written
    except Exception as e:
        logger.error(f"Failed to batch delete {collection} ({written} deleted before error): {e}")
        return written


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
