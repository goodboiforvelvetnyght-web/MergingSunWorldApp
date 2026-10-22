# Put Merging Sun online

**Recommended:** use [the GitHub publishing workflow](GITHUB_DEPLOYMENT.md) for browser-based setup and automatic future releases. The manual computer-based method below remains available, but the dedicated runtime service account must first be created through the Google setup script.

The app is built, and its local browser, authentication, and backend integration tests pass. The Firebase project already has Authentication and Firestore. No `firebase init` is needed: configuration and security rules are included.

## 1. Enable the required billing plan

Open the Firebase console, choose **MergingSunAPP-2** (project ID `mergingsunapp-2`), and check the billing plan. If it is still on Spark, upgrade to **Blaze** and link a billing account. Cloud Functions needs this plan to run the server-side travel and admin logic. You do not need to enable Firebase Storage for this version.

## 2. Get the project onto your computer

Download and extract the supplied `MergingSunWorldApp-deploy.zip`. Install Node.js 22 LTS if it is not already installed. Open a terminal inside the extracted **MergingSunWorldApp** folder, where `package.json` is located.

## 3. Install, sign in, and deploy

Run these commands one at a time:

```bash
npm ci
npm --prefix functions ci
npx firebase login
npm run deploy
```

The login command opens your browser. Sign in to the Google account that owns or has deployment access to `mergingsunapp-2`. Keep login verification codes in the Firebase login flow; never paste passwords, tokens, service-account files, or login codes into chat.

If you are already signed in with a different Google account, use `npx firebase login --reauth` and select the correct account.

`npm run deploy` builds the website, compiles the backend through the configured predeploy hook, then deploys the Firestore rules and indexes, Cloud Functions, and Firebase Hosting to **mergingsunapp-2**. It changes the live project. Firebase may ask to enable required Google Cloud APIs or choose an artifact cleanup policy; review those prompts. A successful command prints the actual Hosting URL. Do not assume deployment succeeded until it reports completion.

## 4. Check the live app

Open the Hosting URL printed by Firebase. Create a player account, create a character, select another reachable location, preview the cost, and confirm travel. Check that energy and position persist after reloading.

The app's signed-out view is a local demo. Sign in to test the connected world. Demo characters and edits do not transfer to Firebase.

If Firebase reports `auth/unauthorized-domain`, add the published hostname in **Authentication → Settings → Authorized domains**.

## 5. Activate your admin account

Visit https://mergingsunapp-2.web.app/admin/activate, sign in with your existing account, and enter your private activation key. The first account's key is bound to its UID and is delivered privately; it is never part of this repository. Admin access appears immediately after successful redemption.

Existing admins can open **World Editor → Admin invitations → Generate admin invitation**. Share the displayed key privately with the recipient and the activation-page URL. In-app keys can be redeemed by any signed-in account, once, within 24 hours. An unused invitation can be revoked from the same panel.

If there is no usable admin or key, a project owner can generate a recovery invitation using Google Application Default Credentials:

```bash
gcloud auth application-default login
npm --prefix functions run invite-admin -- YOUR_FIREBASE_AUTH_UID
```

Do not send Google passwords, login codes, private keys, or service-account files through chat. Firebase Storage does not need to be enabled for this release's small character portraits.
