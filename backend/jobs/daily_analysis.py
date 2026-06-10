import os
import logging
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

def run():
    job_run_id = str(uuid.uuid4())
    job_name = "daily-analysis"
    start_time = datetime.now(timezone.utc)

    logger.info(f"jobRunId={job_run_id} jobName={job_name} status=started")

    _aggregate_trends(job_run_id)
    _recalculate_scores(job_run_id)

    end_time = datetime.now(timezone.utc)
    logger.info(
        f"jobRunId={job_run_id} jobName={job_name} status=completed "
        f"startTime={start_time.isoformat()} endTime={end_time.isoformat()}"
    )

def _aggregate_trends(job_run_id: str):
    logger.info(f"jobRunId={job_run_id} step=aggregate-trends status=started")
    # TODO: SOT-351で実装
    logger.info(f"jobRunId={job_run_id} step=aggregate-trends status=completed")

def _recalculate_scores(job_run_id: str):
    logger.info(f"jobRunId={job_run_id} step=recalculate-scores status=started")
    # TODO: SOT-351で実装
    logger.info(f"jobRunId={job_run_id} step=recalculate-scores status=completed")
