#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
REGION="${GCP_REGION:-asia-northeast1}"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/stock-signal-registry/stock-signal-research-jobs"
SA_EMAIL="stock-signal-sa@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Deploying Cloud Run Jobs for project: $PROJECT_ID"

# Build and push jobs Docker image
echo "Building and pushing jobs Docker image..."
gcloud builds submit \
  --tag="${IMAGE_NAME}:latest" \
  --project="$PROJECT_ID" \
  --file=Dockerfile.jobs \
  /workspaces/stock-signal-research

COMMON_FLAGS=(
  --region="$REGION"
  --project="$PROJECT_ID"
  --image="${IMAGE_NAME}:latest"
  --service-account="$SA_EMAIL"
  --memory=512Mi
  --cpu=1
  --task-timeout=900
  --max-retries=3
  --set-env-vars="APP_ENV=production,GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION},USE_SAMPLE_DATA=false"
)

# collect-papers job
if gcloud run jobs describe collect-papers --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  gcloud run jobs update collect-papers "${COMMON_FLAGS[@]}" --update-env-vars="JOB_NAME=collect-papers"
  echo "Updated job: collect-papers"
else
  gcloud run jobs create collect-papers "${COMMON_FLAGS[@]}" --set-env-vars="APP_ENV=production,GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION},USE_SAMPLE_DATA=false,JOB_NAME=collect-papers"
  echo "Created job: collect-papers"
fi

# collect-news job
if gcloud run jobs describe collect-news --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  gcloud run jobs update collect-news "${COMMON_FLAGS[@]}" --update-env-vars="JOB_NAME=collect-news"
  echo "Updated job: collect-news"
else
  gcloud run jobs create collect-news "${COMMON_FLAGS[@]}" --set-env-vars="APP_ENV=production,GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION},USE_SAMPLE_DATA=false,JOB_NAME=collect-news"
  echo "Created job: collect-news"
fi

# daily-analysis job
if gcloud run jobs describe daily-analysis --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  gcloud run jobs update daily-analysis "${COMMON_FLAGS[@]}" --update-env-vars="JOB_NAME=daily-analysis"
  echo "Updated job: daily-analysis"
else
  gcloud run jobs create daily-analysis "${COMMON_FLAGS[@]}" --set-env-vars="APP_ENV=production,GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION},USE_SAMPLE_DATA=false,JOB_NAME=daily-analysis"
  echo "Created job: daily-analysis"
fi

echo ""
echo "All Cloud Run Jobs deployed."
echo "Manual execution:"
echo "  gcloud run jobs execute collect-papers --region=$REGION --project=$PROJECT_ID"
echo "  gcloud run jobs execute collect-news --region=$REGION --project=$PROJECT_ID"
echo "  gcloud run jobs execute daily-analysis --region=$REGION --project=$PROJECT_ID"
