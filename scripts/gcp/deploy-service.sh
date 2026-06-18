#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE_NAME="stock-signal-service"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/stock-signal-registry/stock-signal-research-app"
SA_EMAIL="stock-signal-sa@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Deploying Cloud Run Service: $SERVICE_NAME"

# Build and push Docker image using Dockerfile.service
echo "Building and pushing Docker image..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CLOUDBUILD_TMP="/tmp/_cloudbuild_service_tmp.yaml"
cat > "${CLOUDBUILD_TMP}" <<CBEOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${IMAGE_NAME}:latest', '-f', 'Dockerfile.service', '.']
images:
  - '${IMAGE_NAME}:latest'
timeout: 600s
CBEOF

gcloud builds submit "${REPO_ROOT}" \
  --project="$PROJECT_ID" \
  --config="${CLOUDBUILD_TMP}" \
  --timeout=600s

rm -f "${CLOUDBUILD_TMP}"

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
  --set-env-vars="APP_ENV=production,GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION},USE_SAMPLE_DATA=false,LOG_LEVEL=INFO,PORT=8080" \
  --set-secrets="FIREBASE_WEB_API_KEY=FIREBASE_API_KEY:latest,AUTH_SECRET=stock-signal-auth-secret:latest,ALLOWED_USER_EMAILS=stock-signal-allowed-emails:latest" \
  --allow-unauthenticated

echo ""
echo "Cloud Run Service deployed: $SERVICE_NAME"
echo "URL: $(gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --format='value(status.url)')"
