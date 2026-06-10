import os
import sys
import logging

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s"
)
logger = logging.getLogger(__name__)

def main():
    job_name = os.getenv("JOB_NAME", "")
    logger.info(f"Starting job: {job_name}")

    if job_name == "collect-papers":
        from jobs.collect_papers import run
        run()
    elif job_name == "collect-news":
        from jobs.collect_news import run
        run()
    elif job_name == "daily-analysis":
        from jobs.daily_analysis import run
        run()
    else:
        logger.error(f"Unknown JOB_NAME: '{job_name}'. Valid values: collect-papers, collect-news, daily-analysis")
        sys.exit(1)

if __name__ == "__main__":
    main()
