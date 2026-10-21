# Validation — 21 October 2026

The app is deployed at https://mergingsunapp-2.web.app through the keyless GitHub Actions workflow. Each push to `main` builds, tests, deploys, and checks the public Hosting and callable endpoints. See the repository's Actions history for the release result for each commit.

## Places editor update

- Frontend and backend TypeScript builds pass.
- 16 unit tests cover routes, energy, legacy-world normalization, allegiance transfers, cascading deletion, and character positions after origin deletion/grid changes.
- 10 browser tests cover map/lore, travel, landscape painting and undo, kingdom-first navigation, border creation and editing, settlement creation outside a border, internal encyclopedia entries, allegiance changes, deletion, persistence, and mobile use.
- 14 Firebase emulator integration checks cover rules, admin authorization, travel transactions, unique place IDs, required borders, valid parent relationships, allegiance transfers, deletion of origins/kingdoms, empty worlds, and subsequent grid changes.
- The unchanged Auth emulator suite and setup-script checks also run in CI before deployment.

Browser editor tests use local demo storage. Firebase integration tests use `demo-merging-sun`; they create no production users and delete no production world content. World schema upgrades preserve legacy content and are persisted only by an admin's publication.
