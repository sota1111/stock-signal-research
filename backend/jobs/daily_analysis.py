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
    """トレンド集計: 日次の論文・ニュース件数をtheme別に集計"""
    logger.info(json.dumps({"jobRunId": job_run_id, "step": "aggregate-trends", "status": "started"}))

    if not use_firestore:
        _aggregate_trends_sqlite(job_run_id)
        logger.info(json.dumps({"jobRunId": job_run_id, "step": "aggregate-trends", "status": "completed"}))
        return

    try:
        logger.warning("Firestore trend aggregation is not implemented; skipping")
    except Exception as e:
        logger.error(f"Firestore trend aggregation failed: {e}")
        raise
    logger.info(json.dumps({"jobRunId": job_run_id, "step": "aggregate-trends", "status": "completed"}))


def _aggregate_trends_sqlite(job_run_id: str):
    """SQLiteを使ったトレンド集計"""
    try:
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
        from app.database import SessionLocal
        from app.models import Theme, PaperMonthlyCount, ExternalInfo
        from app.services.scoring import calculate_precursor_score
        db = SessionLocal()
        try:
            themes = db.query(Theme).all()
            for theme in themes:
                # 論文月次推移を取得
                pm_counts = db.query(PaperMonthlyCount).filter(
                    PaperMonthlyCount.theme_id == theme.id
                ).order_by(PaperMonthlyCount.year_month.asc()).all()
                
                # 前兆スコア計算
                theme.precursor_score = calculate_precursor_score(pm_counts)
                
                # 最新のMoM変化率でトレンド判定
                if pm_counts:
                    latest_mom = pm_counts[-1].mom_change_pct
                    theme.is_trending = latest_mom > 20.0
                
            db.commit()
            logger.info(f"Updated precursor_score and is_trending for {len(themes)} themes in SQLite")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"SQLite aggregation failed: {e}")
        raise


def _recalculate_scores(job_run_id: str, use_firestore: bool):
    """スコア再計算: テーマ別・企業別の前兆スコアを保存"""
    logger.info(json.dumps({"jobRunId": job_run_id, "step": "recalculate-scores", "status": "started"}))

    if not use_firestore:
        _recalculate_scores_sqlite(job_run_id)
        logger.info(json.dumps({"jobRunId": job_run_id, "step": "recalculate-scores", "status": "completed"}))
        return

    try:
        logger.warning("Firestore score recalculation is not implemented; skipping")
    except Exception as e:
        logger.error(f"Firestore score recalculation failed: {e}")
        raise
    logger.info(json.dumps({"jobRunId": job_run_id, "step": "recalculate-scores", "status": "completed"}))


def _recalculate_scores_sqlite(job_run_id: str):
    """SQLiteを使ったAlignmentScore再計算"""
    try:
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
        from app.database import SessionLocal
        from app.models import Theme, ExternalInfo, AlignmentScore, PaperMonthlyCount
        from app.services.scoring import calculate_alignment_score
        from datetime import datetime, timezone
        db = SessionLocal()
        try:
            themes = db.query(Theme).all()
            for theme in themes:
                # 外部情報のカウント
                N = db.query(ExternalInfo).filter(
                    ExternalInfo.theme_id == theme.id, 
                    ExternalInfo.info_type == "news"
                ).count()
                A = db.query(ExternalInfo).filter(
                    ExternalInfo.theme_id == theme.id, 
                    ExternalInfo.info_type == "announcement"
                ).count()
                E = db.query(ExternalInfo).filter(
                    ExternalInfo.theme_id == theme.id, 
                    ExternalInfo.info_type == "earnings"
                ).count()
                
                # 最新の論文MoM変化率を取得
                latest_pmc = db.query(PaperMonthlyCount).filter(
                    PaperMonthlyCount.theme_id == theme.id
                ).order_by(PaperMonthlyCount.year_month.desc()).first()
                mom = latest_pmc.mom_change_pct if latest_pmc else 0.0
                
                # アライメントスコア計算
                result = calculate_alignment_score(N, A, E, mom)
                
                # 保存 (Upsert)
                existing = db.query(AlignmentScore).filter(AlignmentScore.theme_id == theme.id).first()
                if existing:
                    existing.score = result["score"]
                    existing.news_score = result["news_score"]
                    existing.announcement_score = result["announcement_score"]
                    existing.earnings_score = result["earnings_score"]
                    existing.confidence = result["confidence"]
                    existing.evidence_count = result["evidence_count"]
                    existing.calculated_at = datetime.now(timezone.utc)
                else:
                    db.add(AlignmentScore(
                        theme_id=theme.id,
                        score=result["score"],
                        news_score=result["news_score"],
                        announcement_score=result["announcement_score"],
                        earnings_score=result["earnings_score"],
                        confidence=result["confidence"],
                        evidence_count=result["evidence_count"],
                    ))
            db.commit()
            logger.info(f"Recalculated AlignmentScore for {len(themes)} themes in SQLite")
        except Exception as e:
            db.rollback()
            logger.error(f"SQLite score recalculation failed: {e}")
            raise
        finally:
            db.close()
    except Exception as e:
        logger.error(f"SQLite score recalculation setup failed: {e}")
        raise
