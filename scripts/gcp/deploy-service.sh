#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE_NAME="stock-signal-service"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/stock-signal-registry/stock-signal-research-app"
SA_EMAIL="stock-signal-sa@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Deploying Cloud Run Service: $SERVICE_NAME"

# Build and push Docker image
echo "Building and pushing Docker image..."
gcloud builds submit \
  --tag="${IMAGE_NAME}:latest" \
  --project="$PROJECT_ID" \
  --config=cloudbuild.yaml \
  /workspaces/stock-signal-research

# Deploy to Cloud Run
gcloud run deploy "$SERVICE_NAME" \
  --image="${IMAGE_NAME}:latest" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --platform=managed \
  --min-instances=0 \
  --max-instances=1 \
  --memory=512Mi \
  --cpu=1 \
  --timeout=300 \
  --concurrency=80 \
  --service-account="$SA_EMAIL" \
  --set-env-vars="APP_ENV=production,GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION}" \
  --allow-unauthenticated

echo ""
echo "Cloud Run Service deployed: $SERVICE_NAME"
echo "URL: $(gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --format='value(status.url)')"
