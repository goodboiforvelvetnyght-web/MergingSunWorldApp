#!/usr/bin/env bash
# Run once in Google Cloud Shell as the project owner after initializing Firebase Storage.
set -euo pipefail
readonly PROJECT='mergingsunapp-2'
readonly BUCKET='mergingsunapp-2.firebasestorage.app'
readonly RUNTIME='merging-sun-runtime@mergingsunapp-2.iam.gserviceaccount.com'
if [[ "$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')" != '277886772831' ]]; then
  echo 'Unexpected project identity; no permissions changed.' >&2
  exit 1
fi
gcloud storage buckets describe "gs://$BUCKET" --project="$PROJECT" --format='value(name)' >/dev/null
# Scope image object access to this bucket. No project IAM, bucket policy management, or public access is granted.
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --project="$PROJECT" --member="serviceAccount:$RUNTIME" --role=roles/storage.objectUser --quiet >/dev/null
echo 'Merging Sun image storage access is ready. Rerun the GitHub deployment.'
