#!/usr/bin/env bash
set -euo pipefail

# ローカル gcloud CLI 認証による Cloud Run デプロイスクリプト
# (stock-signal-research - Cloud Run Service)
#
# 使い方:
#   cp .env.example .env && vi .env
#   source .env && bash scripts/deploy_local_gcp.sh

if [ -f .env ]; then set -a; source .env; set +a; fi

PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE_NAME="${CLOUD_RUN_SERVICE_NAME:-stock-signal-research}"
ARTIFACT_REPO="${ARTIFACT_REGISTRY_REPOSITORY:-stock-signal-registry}"
IMAGE_VAR="${IMAGE_NAME:-stock-signal-research-app}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${IMAGE_VAR}"

echo "== Cloud Run デプロイ: ${SERVICE_NAME} =="
echo "Project: ${PROJECT_ID} | Region: ${REGION}"
echo "Image: ${IMAGE}"

# gcloud 認証確認
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# Artifact Registry リポジトリ作成（なければ）
gcloud artifacts repositories describe "${ARTIFACT_REPO}" \
  --project="${PROJECT_ID}" --location="${REGION}" &>/dev/null || \
gcloud artifacts repositories create "${ARTIFACT_REPO}" \
  --project="${PROJECT_ID}" --location="${REGION}" \
  --repository-format=docker \
  --description="Stock Signal Research Docker images"

# Cloud Build でビルド & プッシュ（Dockerfile.service を使用）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

CLOUDBUILD_TMP="${REPO_ROOT}/_cloudbuild_service_tmp.yaml"
cat > "${CLOUDBUILD_TMP}" <<CBEOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${IMAGE}:latest', '-f', 'Dockerfile.service', '.']
images:
  - '${IMAGE}:latest'
timeout: 600s
CBEOF

gcloud builds submit "${REPO_ROOT}" \
  --project="${PROJECT_ID}" \
  --config="${CLOUDBUILD_TMP}" \
  --timeout=600s

rm -f "${CLOUDBUILD_TMP}"

# Cloud Run へデプロイ
# Secret Manager: 初回デプロイ前に以下を実行してください
# echo -n "value" | gcloud secrets create stock-signal-auth-password --data-file=- --project=$PROJECT_ID
# echo -n "value" | gcloud secrets create stock-signal-auth-secret-key --data-file=- --project=$PROJECT_ID
# echo -n "value" | gcloud secrets create stock-signal-semantic-scholar-api-key --data-file=- --project=$PROJECT_ID
# echo -n "value" | gcloud secrets create stock-signal-news-api-key --data-file=- --project=$PROJECT_ID
# echo -n "value" | gcloud secrets create stock-signal-llm-api-key --data-file=- --project=$PROJECT_ID
# echo -n "value" | gcloud secrets create stock-signal-app-admin-token --data-file=- --project=$PROJECT_ID
# gcloud run services add-iam-policy-binding stock-signal-research \
#   --member="serviceAccount:$(gcloud run services describe stock-signal-research --region=$REGION --project=$PROJECT_ID --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || echo PROJECT_NUMBER-compute@developer.gserviceaccount.com)" \
#   --role="roles/secretmanager.secretAccessor" --region=$REGION --project=$PROJECT_ID

gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE}:latest" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --platform=managed \
  --min-instances=0 \
  --max-instances=1 \
  --memory=512Mi \
  --cpu=1 \
  --timeout=300 \
  --concurrency=80 \
  --set-env-vars="APP_ENV=production,GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION},AUTH_USERNAME=${AUTH_USERNAME:-admin},USE_SAMPLE_DATA=false,LOG_LEVEL=INFO,PORT=8080" \
  --set-secrets="AUTH_PASSWORD=stock-signal-auth-password:latest,AUTH_SECRET_KEY=stock-signal-auth-secret-key:latest,SEMANTIC_SCHOLAR_API_KEY=stock-signal-semantic-scholar-api-key:latest,NEWS_API_KEY=stock-signal-news-api-key:latest,LLM_API_KEY=stock-signal-llm-api-key:latest,APP_ADMIN_TOKEN=stock-signal-app-admin-token:latest" \
  --allow-unauthenticated \
  --quiet

URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" --project="${PROJECT_ID}" \
  --format='value(status.url)')

echo ""
echo "== デプロイ完了 =="
echo "Service URL: ${URL}"
