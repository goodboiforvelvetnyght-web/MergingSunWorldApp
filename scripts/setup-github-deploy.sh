#!/usr/bin/env bash
# Run once in Google Cloud Shell while signed in as the Firebase project owner.
# Creates keyless deployment access. It never creates or prints a private key.
set -euo pipefail
readonly PROJECT='mergingsunapp-2'
readonly EXPECTED_PROJECT_NUMBER='277886772831'
readonly REGION='asia-southeast1'
readonly REPOSITORY='goodboiforvelvetnyght-web/MergingSunWorldApp'
readonly REPOSITORY_ID='1427839663'
readonly OWNER_ID='345229661'
readonly POOL='merging-sun-github'
readonly PROVIDER='github'
readonly DEPLOY_ACCOUNT="github-deploy@${PROJECT}.iam.gserviceaccount.com"
readonly RUNTIME_ACCOUNT="merging-sun-runtime@${PROJECT}.iam.gserviceaccount.com"
command -v gcloud >/dev/null || { echo 'Open Google Cloud Shell to run this script.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'Python 3 is required (included in Google Cloud Shell).' >&2; exit 1; }
if [ -z "$(gcloud auth list --filter=status:ACTIVE --format='value(account)')" ]; then
  echo 'Sign into Google Cloud Shell with the project owner account first.' >&2
  exit 1
fi
project_number=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
if [ "$project_number" != "$EXPECTED_PROJECT_NUMBER" ]; then
  echo 'Project identity did not match the expected Firebase project. No changes made.' >&2
  exit 1
fi
billing=$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)')
if [[ "$billing" != 'True' && "$billing" != 'true' ]]; then
  echo 'Enable the Blaze billing plan in Firebase for mergingsunapp-2, then rerun this script.' >&2
  exit 1
fi
printf 'Configuring keyless GitHub deployment for %s only.\n' "$PROJECT"
gcloud services enable --project="$PROJECT" --quiet \
  firebase.googleapis.com firebasehosting.googleapis.com firebaserules.googleapis.com \
  firestore.googleapis.com cloudfunctions.googleapis.com cloudbuild.googleapis.com \
  run.googleapis.com artifactregistry.googleapis.com eventarc.googleapis.com \
  pubsub.googleapis.com logging.googleapis.com storage.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  cloudresourcemanager.googleapis.com compute.googleapis.com

# Discover existing resources explicitly; errors abort rather than being treated as absence.
accounts=$(gcloud iam service-accounts list --project="$PROJECT" --format='value(email)')
account_exists() { printf '%s\n' "$accounts" | grep -Fxq "$1"; }
if ! account_exists "$DEPLOY_ACCOUNT"; then
  gcloud iam service-accounts create github-deploy --project="$PROJECT" --display-name='Merging Sun GitHub deployer' --quiet
fi
if ! account_exists "$RUNTIME_ACCOUNT"; then
  gcloud iam service-accounts create merging-sun-runtime --project="$PROJECT" --display-name='Merging Sun app runtime' --quiet
fi

# Deployment identity can release this app; it cannot grant itself new IAM roles.
for role in roles/firebasehosting.admin roles/firebaserules.admin roles/datastore.indexAdmin \
  roles/cloudfunctions.admin roles/run.admin roles/firebase.viewer \
  roles/serviceusage.serviceUsageAdmin roles/artifactregistry.reader roles/cloudbuild.builds.viewer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$DEPLOY_ACCOUNT" --role="$role" --condition=None --quiet >/dev/null
done
# The running application only needs Firestore access.
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$RUNTIME_ACCOUNT" --role=roles/datastore.user --condition=None --quiet >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_ACCOUNT" --project="$PROJECT" --member="serviceAccount:$DEPLOY_ACCOUNT" --role=roles/iam.serviceAccountUser --condition=None --quiet >/dev/null

# Grant the actual project's default Cloud Build identity the documented builder role.
build_account=$(gcloud builds get-default-service-account --project="$PROJECT" --region="$REGION" --format='value(serviceAccountEmail)')
build_account="${build_account##*/}"
case "$build_account" in
  "${project_number}-compute@developer.gserviceaccount.com"|"${project_number}@cloudbuild.gserviceaccount.com") ;;
  *) echo 'Unexpected default Cloud Build identity. Stop and share this error with Codex.' >&2; exit 1 ;;
esac
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$build_account" --role=roles/cloudbuild.builds.builder --condition=None --quiet >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$build_account" --project="$PROJECT" --member="serviceAccount:$DEPLOY_ACCOUNT" --role=roles/iam.serviceAccountUser --condition=None --quiet >/dev/null
# Firebase CLI also checks the legacy App Engine identity if the project has one.
if account_exists "${PROJECT}@appspot.gserviceaccount.com"; then
  gcloud iam service-accounts add-iam-policy-binding "${PROJECT}@appspot.gserviceaccount.com" --project="$PROJECT" --member="serviceAccount:$DEPLOY_ACCOUNT" --role=roles/iam.serviceAccountUser --condition=None --quiet >/dev/null
fi

pools=$(gcloud iam workload-identity-pools list --project="$PROJECT" --location=global --format='value(name)')
if ! printf '%s\n' "$pools" | grep -Fxq "projects/$project_number/locations/global/workloadIdentityPools/$POOL"; then
  gcloud iam workload-identity-pools create "$POOL" --project="$PROJECT" --location=global --display-name='Merging Sun GitHub' --quiet
fi
providers=$(gcloud iam workload-identity-pools providers list --project="$PROJECT" --location=global --workload-identity-pool="$POOL" --format='value(name)')
provider_name="projects/$project_number/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
condition="assertion.repository_id == '$REPOSITORY_ID' && assertion.repository_owner_id == '$OWNER_ID' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == '$REPOSITORY/.github/workflows/firebase.yml@refs/heads/main' && (assertion.event_name == 'push' || assertion.event_name == 'workflow_dispatch')"
mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref'
if printf '%s\n' "$providers" | grep -Fxq "$provider_name"; then
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER" --project="$PROJECT" --location=global --workload-identity-pool="$POOL" --issuer-uri=https://token.actions.githubusercontent.com --attribute-mapping="$mapping" --attribute-condition="$condition" --quiet
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project="$PROJECT" --location=global --workload-identity-pool="$POOL" --display-name='GitHub main deployment' --issuer-uri=https://token.actions.githubusercontent.com --attribute-mapping="$mapping" --attribute-condition="$condition" --quiet
fi
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_ACCOUNT" --project="$PROJECT" --role=roles/iam.workloadIdentityUser --member="principalSet://iam.googleapis.com/projects/$project_number/locations/global/workloadIdentityPools/$POOL/attribute.repository_id/$REPOSITORY_ID" --condition=None --quiet >/dev/null

# Firebase's first unattended deployment needs an artifact repository cleanup policy.
# Preserve all existing policies. Add the seven-day policy only when none exist.
repositories=$(gcloud artifacts repositories list --project="$PROJECT" --location="$REGION" --format='value(name)')
if ! printf '%s\n' "$repositories" | grep -Fxq "projects/$PROJECT/locations/$REGION/repositories/gcf-artifacts"; then
  gcloud artifacts repositories create gcf-artifacts --project="$PROJECT" --location="$REGION" --repository-format=docker --description='Cloud Functions build artifacts' --quiet
fi
policies=$(gcloud artifacts repositories describe gcf-artifacts --project="$PROJECT" --location="$REGION" --format='json(cleanupPolicies)')
if printf '%s' "$policies" | python3 -c 'import json,sys; sys.exit(0 if not json.load(sys.stdin).get("cleanupPolicies") else 1)'; then
  cleanup_file=$(mktemp)
  trap 'rm -f "$cleanup_file"' EXIT
  printf '%s\n' '[{"name":"firebase-cli-cleanup-policy","action":{"type":"Delete"},"condition":{"tagState":"any","olderThan":"7d"}}]' > "$cleanup_file"
  gcloud artifacts repositories set-cleanup-policies gcf-artifacts --project="$PROJECT" --location="$REGION" --policy="$cleanup_file" --no-dry-run --quiet
fi
printf '\nGoogle setup complete. No private key was created.\n'
printf 'Provider: %s\nService account: %s\n' "$provider_name" "$DEPLOY_ACCOUNT"
printf 'Return to Codex and say: Google setup complete. Codex can enable deployment and run GitHub Actions.\n'
