#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
REGION="${GCP_REGION:-asia-northeast1}"
SA_EMAIL="stock-signal-sa@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Creating Cloud Scheduler jobs for project: $PROJECT_ID"
echo "Note: Maximum 3 jobs to stay within free tier."

# collect-papers: JST 06:00 = UTC 21:00 (previous day)
if gcloud scheduler jobs describe collect-papers-scheduler \
    --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  echo "Scheduler 'collect-papers-scheduler' already exists. Skipping."
else
  gcloud scheduler jobs create http collect-papers-scheduler \
    --location="$REGION" \
    --project="$PROJECT_ID" \
    --schedule="0 21 * * *" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/collect-papers:run" \
    --message-body="{}" \
    --oauth-service-account-email="$SA_EMAIL" \
    --description="Collect papers from arXiv (JST 06:00)"
  echo "Created scheduler: collect-papers-scheduler (JST 06:00)"
fi

# collect-news: JST 06:30 = UTC 21:30
if gcloud scheduler jobs describe collect-news-scheduler \
    --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  echo "Scheduler 'collect-news-scheduler' already exists. Skipping."
else
  gcloud scheduler jobs create http collect-news-scheduler \
    --location="$REGION" \
    --project="$PROJECT_ID" \
    --schedule="30 21 * * *" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/collect-news:run" \
    --message-body="{}" \
    --oauth-service-account-email="$SA_EMAIL" \
    --description="Collect news from RSS (JST 06:30)"
  echo "Created scheduler: collect-news-scheduler (JST 06:30)"
fi

# daily-analysis: JST 07:00 = UTC 22:00
if gcloud scheduler jobs describe daily-analysis-scheduler \
    --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  echo "Scheduler 'daily-analysis-scheduler' already exists. Skipping."
else
  gcloud scheduler jobs create http daily-analysis-scheduler \
    --location="$REGION" \
    --project="$PROJECT_ID" \
    --schedule="0 22 * * *" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/daily-analysis:run" \
    --message-body="{}" \
    --oauth-service-account-email="$SA_EMAIL" \
    --description="Daily trend aggregation and score calculation (JST 07:00)"
  echo "Created scheduler: daily-analysis-scheduler (JST 07:00)"
fi

echo ""
echo "Cloud Scheduler jobs created (3 jobs - within free tier limit)."
