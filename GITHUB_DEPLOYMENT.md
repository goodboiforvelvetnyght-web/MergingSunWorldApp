# Publish through GitHub

The repository's **Test and deploy Firebase** workflow builds the app, runs the route tests, checks Firebase security rules and transactions in emulators, and tests the website and sign-in in a browser. A successful `main` build can then publish the site, functions, and Firestore rules to `mergingsunapp-2`.

The deployment connection uses Google Workload Identity Federation: GitHub receives short-lived credentials for a dedicated deployment identity. There is no service-account JSON key, Firebase token, password, or secret to copy into GitHub.

## One-time Google connection — in your browser

1. In [Firebase Console](https://console.firebase.google.com/project/mergingsunapp-2/overview), check that **MergingSunAPP-2** is on the **Blaze** plan. Upgrade if needed; the backend requires billing to be enabled.
2. Open [Google Cloud Shell](https://shell.cloud.google.com/?project=mergingsunapp-2) while signed into the Google account that owns the project. This provides a terminal inside the browser; nothing needs installing on Windows.
3. Review [the setup script](scripts/setup-github-deploy.sh). Run the following in Cloud Shell, accepting Google's authorization prompt if it appears:

```bash
curl -fsSL https://raw.githubusercontent.com/goodboiforvelvetnyght-web/MergingSunWorldApp/main/scripts/setup-github-deploy.sh -o /tmp/merging-sun-setup.sh
bash /tmp/merging-sun-setup.sh
```

When the script prints **Google setup complete**, return to Codex and say so. IAM changes may take a few minutes to propagate. Codex can then enable the deployment switch and push that change, which starts the first deployment automatically. Do not send passwords or authorization codes in chat.

If you prefer to activate it yourself, change `"enabled": false` to `"enabled": true` in [.github/deployment.json](.github/deployment.json) on `main`. GitHub's file editor can make this one-line change. Keep it false until Google setup succeeds.

## What the setup changes

The script is fixed to project `mergingsunapp-2` and verifies its expected project number before changing anything. It checks for billing, enables the APIs needed for deployment, and configures:

- `github-deploy@mergingsunapp-2.iam.gserviceaccount.com`: permissions for Hosting, Firebase rules, indexes, Functions, Cloud Run, Firebase project discovery, service API/identity setup, and reading build/artifact information. It is not an Owner or Editor and cannot grant itself more IAM permissions.
- `merging-sun-runtime@mergingsunapp-2.iam.gserviceaccount.com`: Firestore access for the running application. It has no deployment or Firebase Authentication administration role.
- The project's actual default Cloud Build identity: the documented builder role, plus permission for the deployer to use the build/runtime identities.
- A Google trust rule limited to this repository's numeric ID and owner ID, branch `main`, and the exact `.github/workflows/firebase.yml` workflow on push/manual events. Pull requests cannot obtain production credentials.
- The `gcf-artifacts` container repository, if needed. Existing cleanup policies are preserved. If no policy exists, a seven-day build-image cleanup policy is added so Firebase can deploy without an interactive retention prompt.

The script adds the required bindings without replacing the project's entire IAM policy. It is repeatable: existing accounts, repositories, and unrelated policies are preserved. No billing plan is changed automatically, no private key is generated, and running the setup does not itself deploy the app.

A deployment-capable identity can replace application code and rules in this project. Only allow trusted changes onto `main`.

## Everyday publishing

After the initial connection:

- Push or merge an update to `main`: tests run, then deployment runs automatically if they pass.
- To redeploy manually, open [Actions](https://github.com/goodboiforvelvetnyght-web/MergingSunWorldApp/actions/workflows/firebase.yml), select **Test and deploy Firebase**, then **Run workflow → main**.
- To pause publishing while still running tests, set `enabled` back to `false` in `.github/deployment.json`.

You do not need to create repository secrets or variables. Provider and service-account identifiers are public configuration in the workflow. Production credentials exist only in the authorized deployment job; dependencies and pull-request tests run before Google authentication.

The deployment job is associated with the `production` GitHub environment. You can optionally configure required reviewers there if you later want a separate approval before every release. No extra approval is required by the workflow itself.

Runs are serialized so one deployment does not interrupt another. The website deployed is the artifact tested in the same run. Backend code is built from the same checked-out commit. The workflow does not force function deletion: removing an existing function may require an explicit maintenance step.

## Confirm it is live

A successful run reports the actual deployment result and checks the Hosting page, a map tile, and authentication enforcement on all three callable functions. The expected default address is `https://mergingsunapp-2.web.app`; it is only a live app after the first successful deployment.

For the first release, also sign in on the live website, create a character, and complete a journey. GitHub's public smoke check deliberately creates no real users and changes no world data.

Admin activation uses [the activation page and invitation flow](DEPLOYMENT.md#5-activate-your-admin-account). The runtime grants application roles through server-controlled Firestore documents; neither it nor the deployment identity needs Firebase Authentication administration permissions. Only the hash of the UID-bound initial key is deployed. Keys generated in the editor are single-use, expire in 24 hours, and can be redeemed by any signed-in account.

## Troubleshooting

- **Tests pass; deployment skipped:** `.github/deployment.json` still has `enabled: false`, or this is a pull request/non-main run.
- **Google authorization fails:** confirm the Cloud Shell script completed under the project owner, allow a few minutes for propagation, then retry. A repository/owner rename may require updating the workflow-reference condition; numeric IDs also prevent name reuse from inheriting access.
- **API, IAM, or billing error:** share the error message with credentials removed. Do not create a service-account key as a workaround.
- **Setup fails partway:** correct the reported permission/billing issue and rerun the same script. Completed steps are retained and reused.
