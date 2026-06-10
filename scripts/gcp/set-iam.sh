#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
REGION="${GCP_REGION:-asia-northeast1}"
SA_NAME="stock-signal-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
REGISTRY_NAME="stock-signal-registry"

echo "Setting up IAM and Artifact Registry for project: $PROJECT_ID"

# Create service account
if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
  echo "Service account '$SA_EMAIL' already exists."
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Stock Signal Research Service Account" \
    --project="$PROJECT_ID"
  echo "Created service account: $SA_EMAIL"
fi

# Grant minimum required roles
ROLES=(
  "roles/datastore.user"
  "roles/secretmanager.secretAccessor"
  "roles/logging.logWriter"
  "roles/cloudscheduler.jobRunner"
  "roles/run.invoker"
)

for ROLE in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE" \
    --condition=None \
    --quiet
  echo "Granted: $ROLE"
done

# Create Artifact Registry repository
if gcloud artifacts repositories describe "$REGISTRY_NAME" \
    --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  echo "Artifact Registry repository '$REGISTRY_NAME' already exists."
else
  gcloud artifacts repositories create "$REGISTRY_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Stock Signal Research Docker images" \
    --project="$PROJECT_ID"
  echo "Created Artifact Registry repository: $REGISTRY_NAME"
fi

echo ""
echo "IAM setup completed."
echo "Service account: $SA_EMAIL"
echo "Artifact Registry: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REGISTRY_NAME}"
