import os
import logging
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

def run():
    job_run_id = str(uuid.uuid4())
    job_name = "collect-news"
    start_time = datetime.now(timezone.utc)

    logger.info(f"jobRunId={job_run_id} jobName={job_name} status=started")

    use_sample = os.getenv("USE_SAMPLE_DATA", "false").lower() == "true"

    if use_sample:
        logger.info("USE_SAMPLE_DATA=true: using sample data")
        _save_sample_news(job_run_id)
    else:
        _collect_from_rss(job_run_id)

    end_time = datetime.now(timezone.utc)
    logger.info(
        f"jobRunId={job_run_id} jobName={job_name} status=completed "
        f"startTime={start_time.isoformat()} endTime={end_time.isoformat()}"
    )

def _collect_from_rss(job_run_id: str):
    logger.info("Collecting news from RSS feeds")
    # TODO: SOT-351で実装

def _save_sample_news(job_run_id: str):
    logger.info("Saving sample news data")
    # TODO: SOT-351でFirestore保存を実装
