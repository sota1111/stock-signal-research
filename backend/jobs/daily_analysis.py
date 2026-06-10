import os
import logging
import uuid
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

logger = logging.getLogger(__name__)


def run():
    job_run_id = str(uuid.uuid4())
    job_name = "daily-analysis"
    start_time = datetime.now(timezone.utc)
    error_message = None

    logger.info(
        json.dumps({
            "jobRunId": job_run_id,
            "jobName": job_name,
            "status": "started",
            "startTime": start_time.isoformat(),
        })
    )

    use_firestore = os.getenv("APP_ENV", "local") != "local"

    if use_firestore:
        try:
            from firestore_client import save_job_run
            save_job_run(job_run_id, job_name, "started", startTime=start_time.isoformat())
        except Exception as e:
            logger.warning(f"Could not save job start to Firestore: {e}")

    try:
        _aggregate_trends(job_run_id, use_firestore)
        _recalculate_scores(job_run_id, use_firestore)
    except Exception as e:
        error_message = str(e)
        logger.error(f"jobRunId={job_run_id} daily-analysis error: {e}")

    end_time = datetime.now(timezone.utc)
    status = "failed" if error_message else "completed"

    log_data = {
        "jobRunId": job_run_id,
        "jobName": job_name,
        "status": status,
        "startTime": start_time.isoformat(),
        "endTime": end_time.isoformat(),
    }
    if error_message:
        log_data["errorMessage"] = error_message

    logger.info(json.dumps(log_data))

    if use_firestore:
        try:
            from firestore_client import save_job_run
            save_job_run(
                job_run_id, job_name, status,
                endTime=end_time.isoformat(),
                errorMessage=error_message,
            )
        except Exception as e:
            logger.warning(f"Could not save job completion to Firestore: {e}")


def _aggregate_trends(job_run_id: str, use_firestore: bool):
    """トレンド集計: 日次の論文・ニュース件数をtheme別に集計しFirestoreに保存"""
    logger.info(json.dumps({"jobRunId": job_run_id, "step": "aggregate-trends", "status": "started"}))

    if not use_firestore:
        logger.info("APP_ENV=local: skipping Firestore aggregation")
        logger.info(json.dumps({"jobRunId": job_run_id, "step": "aggregate-trends", "status": "completed"}))
        return

    try:
        from firestore_client import get_db, upsert_document
        db = get_db()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        year_month = datetime.now(timezone.utc).strftime("%Y-%m")

        # 論文コレクションからテーマ別件数を集計
        theme_paper_counts: Dict[str, int] = {}
        papers_ref = db.collection("papers")
        for doc in papers_ref.stream():
            data = doc.to_dict()
            theme = data.get("theme", "unknown")
            theme_paper_counts[theme] = theme_paper_counts.get(theme, 0) + 1

        # ニュースコレクションからテーマ別件数を集計
        theme_news_counts: Dict[str, int] = {}
        news_ref = db.collection("news")
        for doc in news_ref.stream():
            data = doc.to_dict()
            theme = data.get("theme", "unknown")
            theme_news_counts[theme] = theme_news_counts.get(theme, 0) + 1

        # trend_snapshotsに保存
        snapshot_id = f"{year_month}-{today}"
        snapshot = {
            "date": today,
            "yearMonth": year_month,
            "paperCountByTheme": theme_paper_counts,
            "newsCountByTheme": theme_news_counts,
            "source": "daily-analysis",
        }
        upsert_document("trend_snapshots", snapshot_id, snapshot)
        logger.info(f"Saved trend snapshot: {snapshot_id}")

    except Exception as e:
        logger.error(f"Failed to aggregate trends: {e}")
        raise

    logger.info(json.dumps({"jobRunId": job_run_id, "step": "aggregate-trends", "status": "completed"}))


def _recalculate_scores(job_run_id: str, use_firestore: bool):
    """スコア再計算: テーマ別・企業別の前兆スコアをFirestoreに保存"""
    logger.info(json.dumps({"jobRunId": job_run_id, "step": "recalculate-scores", "status": "started"}))

    if not use_firestore:
        logger.info("APP_ENV=local: skipping Firestore score calculation")
        logger.info(json.dumps({"jobRunId": job_run_id, "step": "recalculate-scores", "status": "completed"}))
        return

    try:
        from firestore_client import get_db, upsert_document
        db = get_db()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # trend_snapshotsから最新スナップショットを取得
        snapshots = list(db.collection("trend_snapshots").order_by("date", direction="DESCENDING").limit(2).stream())

        if len(snapshots) < 1:
            logger.info("No trend snapshots found, skipping score calculation")
            logger.info(json.dumps({"jobRunId": job_run_id, "step": "recalculate-scores", "status": "completed"}))
            return

        latest = snapshots[0].to_dict()
        paper_counts = latest.get("paperCountByTheme", {})

        # シンプルなスコア計算（論文数と前月比からスコアを算出）
        for theme, count in paper_counts.items():
            prev_count = 0
            if len(snapshots) >= 2:
                prev = snapshots[1].to_dict()
                prev_count = prev.get("paperCountByTheme", {}).get(theme, 0)

            mom_change = ((count - prev_count) / max(prev_count, 1)) * 100
            precursor_score = min(100.0, max(0.0, 50.0 + mom_change * 0.5))

            score_doc = {
                "theme": theme,
                "precursorScore": precursor_score,
                "paperCount": count,
                "prevPaperCount": prev_count,
                "momChangePct": mom_change,
                "calculatedAt": today,
                "source": "daily-analysis",
            }
            upsert_document("scores", f"theme-{theme}-{today}", score_doc)

        logger.info(f"Recalculated scores for {len(paper_counts)} themes")

    except Exception as e:
        logger.error(f"Failed to recalculate scores: {e}")
        raise

    logger.info(json.dumps({"jobRunId": job_run_id, "step": "recalculate-scores", "status": "completed"}))
