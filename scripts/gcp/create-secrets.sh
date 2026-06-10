#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"

echo "Creating secrets in Secret Manager for project: $PROJECT_ID"
echo "Note: You will be prompted to enter each secret value."

create_secret_if_not_exists() {
  local SECRET_NAME="$1"
  local SECRET_VALUE="$2"

  if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
    echo "Secret '$SECRET_NAME' already exists. Skipping."
  else
    echo -n "$SECRET_VALUE" | gcloud secrets create "$SECRET_NAME" \
      --project="$PROJECT_ID" \
      --replication-policy=automatic \
      --data-file=-
    echo "Created secret: $SECRET_NAME"
  fi
}

# Create placeholder secrets (replace with actual values before deploying)
create_secret_if_not_exists "SEMANTIC_SCHOLAR_API_KEY" "placeholder"
create_secret_if_not_exists "NEWS_API_KEY" "placeholder"
create_secret_if_not_exists "LLM_API_KEY" "placeholder"
create_secret_if_not_exists "APP_ADMIN_TOKEN" "$(openssl rand -hex 32)"

echo ""
echo "Secrets created. Update the values with actual credentials:"
echo "  gcloud secrets versions add SECRET_NAME --data-file=- --project=$PROJECT_ID"
