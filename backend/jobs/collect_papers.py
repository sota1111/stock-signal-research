import os
import logging
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

def run():
    job_run_id = str(uuid.uuid4())
    job_name = "collect-papers"
    start_time = datetime.now(timezone.utc)

    logger.info(f"jobRunId={job_run_id} jobName={job_name} status=started")

    use_sample = os.getenv("USE_SAMPLE_DATA", "false").lower() == "true"

    if use_sample:
        logger.info("USE_SAMPLE_DATA=true: using sample data, skipping external API")
        _save_sample_papers(job_run_id)
    else:
        _collect_from_arxiv(job_run_id)

    end_time = datetime.now(timezone.utc)
    logger.info(
        f"jobRunId={job_run_id} jobName={job_name} status=completed "
        f"startTime={start_time.isoformat()} endTime={end_time.isoformat()}"
    )

def _collect_from_arxiv(job_run_id: str):
    logger.info("Collecting papers from arXiv (no API key required)")
    # TODO: SOT-351でFirestore保存を実装

def _save_sample_papers(job_run_id: str):
    logger.info("Saving sample papers data")
    # TODO: SOT-351でFirestore保存を実装
