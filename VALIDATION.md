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

## Map upload timeout repair — 22 October 2026

Production logs identified two map uploads ending with HTTP 504 at the former 120-second deadline. Map preparation now reuses decoded pixel buffers, overlaps up to eight Storage writes, and permits one upload per function instance with a 300-second deadline. The browser allows 360 seconds and shows an upload-specific retry message on failure.

The image integration check now uploads a detailed 3969 × 1814 JPEG larger than 2 MB, verifies high-resolution tiles contain image detail, and checks the edge tile. The connected browser check simulates a gateway timeout, verifies publishing stays disabled during processing and unlocks afterward, then successfully retries the upload without changing the published map until requested.

## Natural proportions and large uploads — 22 October 2026

The unit suite now has 24 checks, including uniform terrain/place/grid transforms, unchanged route energy, equal-aspect artwork replacement, legacy unpadding, and complete hex enumeration with translated grids and portrait bounds. Firebase integration adds five checks for private chunk tickets and originals, a JPEG over 6 MiB at the full 8192-pixel edge, native zoom-5 tiles, upload idempotency, invalid dimensions and checksums, atomic character/population migration, restoration guards and orphaned origins. The 31 prior integration checks remain.

The connected browser suite uses a detailed 3969 × 1814 JPEG, exercises upload/processing progress, simulated 504 and 500 responses, reselect-to-resume, draft preservation, a visual alignment preview, publication and shared-room access after coordinate migration. Production smoke checks include authorization on all three new upload callables and create no users or world content.

## Desktop editor and interpolated borders — 22 October 2026

The unit suite now has 29 tests. New geometry checks cover anchor interpolation, straight-border compatibility, sharp corners, duplicate/edge points, curve hit testing, preservation during map alignment and road graph tracing through chains, branches and loops. Firebase integration now has 37 checks, including persistence of spline style/sharp metadata and rejection of invalid metadata.

The production browser suite has 19 tests. New checks exercise multi-step point dragging as one undo action, redo, text-field shortcut isolation, right-click corner changes, segment insertion, minimum closed-border size, middle-button panning during drawing, wheel zoom without geometry changes, local border-form recovery and separate publication. Editor tests run on desktop; player creation, map and location flows retain mobile checks. The connected browser and Auth suites continue to run against isolated emulators before release.

No production world content is changed by deploying this UI. Existing borders retain their straight appearance until an admin selects a smooth border and publishes it. Road smoothing changes only rendering; terrain, river and energy calculations remain authoritative on the hex grid.

## Google account sign-in — 22 October 2026

The Auth emulator browser suite now has nine checks: the four existing email/password flows plus Google popup registration and reload persistence, existing same-email UID preservation, password-verified collision linking (including a wrong-password rejection), cancellation and blocked-popup recovery. The collision case models an unverified provider response in the isolated emulator widget so Firebase requires explicit linking; no real Google account or production user is created.

The production browser suite now has 20 tests, including Google availability during login/registration and the unchanged email reset flow. The project's public Firebase configuration was checked for authorized Hosting domains and a Google authorization URL before release. The app continues to use UID-based roles and character ownership; no backend authorization rule changes are required.
