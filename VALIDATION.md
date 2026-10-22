# Validation — 21 October 2026

The app is deployed at https://mergingsunapp-2.web.app through the keyless GitHub Actions workflow. Each push to `main` builds, tests, deploys, and checks the public Hosting and callable endpoints. See the repository's Actions history for the release result for each commit.

## Character creation, roads, and admin invitations

- Frontend and backend TypeScript builds pass.
- 19 unit tests cover routes, energy, legacy-world normalization, allegiance transfers, cascading deletion, and character positions after origin deletion/grid changes.
- 15 browser tests cover map/lore, travel, landscape painting and undo, kingdom-first navigation, border creation and editing, settlement creation outside a border, internal encyclopedia entries, allegiance changes, deletion, persistence, and mobile use.
- 24 Firebase emulator integration checks cover rules, admin authorization, travel transactions, unique place IDs, required borders, valid parent relationships, allegiance transfers, deletion of origins/kingdoms, empty worlds, and subsequent grid changes.
- The unchanged Auth emulator suite and setup-script checks also run in CI before deployment.

Browser editor tests use local demo storage. Firebase integration tests use `demo-merging-sun`; they create no production users and delete no production world content. World schema upgrades preserve legacy content and are persisted only by an admin's publication.

The expanded suite verifies 50% road discounts with full river surcharges, rounding the journey total only once, cheaper road detours, full-page creation, map-based kingdom selection, portrait resizing, mobile draft recovery, private real-name reads, confirmed/idempotent recreation, and rejection of stale travel after recreation. Invitation checks cover admin authorization, hashed key storage, expiry, revocation, concurrent redemption, retry safety, and throttling. Three connected browser checks exercise activation, invitation generation/redemption by another account, and saved character creation. The local bootstrap browser run also uses the actual initial key against the demo emulators; it never activates a production account.

## Review, Storage, occupancy, and heraldry update

`npm run test:firebase` now starts Auth, Firestore, Functions, and Storage emulators. Its 31 checks include approval/rejection/resubmission, concurrent review decisions, replacement preservation, private application rules, direct Storage denial, co-location checks, private field projection, image processing, map publication, aggregate population consistency, grid resets for orphaned origins, and legacy portrait migration.

`npm run test:connected-ui` covers real registration/sign-in, admin invitations, full-page submission, rejection with a reason, editing/resubmission, approval, then connected map/flag uploads and location entry on desktop/mobile. It uses only the isolated `demo-merging-sun` emulators. Public production checks create no accounts or characters.

The deployment workflow checks the runtime's effective Storage permissions before publishing the new app. A missing bucket permission stops release before changing existing gameplay code or rules. `scripts/setup-storage-access.sh` grants only object access on this app's bucket to its custom runtime identity.
