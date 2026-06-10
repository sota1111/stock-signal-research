#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
REGION="${GCP_REGION:-asia-northeast1}"

echo "Creating Firestore database in project: $PROJECT_ID, region: $REGION"

gcloud firestore databases create \
  --project="$PROJECT_ID" \
  --location="$REGION" \
  --type=firestore-native

echo "Firestore database created successfully."
echo "Note: If it already exists, you can ignore the error above."
