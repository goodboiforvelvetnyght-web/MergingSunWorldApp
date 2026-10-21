# Validation — 21 October 2026

The first version is verified as a local playable preview. It has not been deployed to Firebase.

| Check                                                   | Result    |
| ------------------------------------------------------- | --------- |
| Clean frozen-lockfile installation with Node 22.23.3    | Passed    |
| Frontend TypeScript and production build                | Passed    |
| Backend TypeScript compilation                          | Passed    |
| Additional unused-code TypeScript check                 | Passed    |
| Route, coordinate, energy, and origin unit tests        | 11 passed |
| Browser tests against the production build              | 6 passed  |
| Firebase Auth emulator browser checks                   | 4 passed  |
| Development server HTML and map-tile requests           | Passed    |
| Firestore rules and callable-function integration suite | 10 passed |

Browser coverage includes map tiles, location filtering and lore deep links, character creation, instant travel and energy deductions, history across reloads, rich-text editing and world persistence, undo, grid changes returning characters to their origin without an energy charge, phone layout, and touch painting/erasing on occupied tiles.

Authentication checks exercise account creation, reload persistence, sign-out/sign-in, and a password-reset request against the isolated Auth emulator. They do not prove production Firebase availability.

The initial Firestore emulator download was blocked by the environment network policy. After the network configuration was applied, the official emulator downloaded with verification intact and all 10 integration checks passed. Coverage includes character ownership, denied direct writes, admin-only publication, authoritative travel costs, duplicate-request idempotency, insufficient energy, stale world versions, and grid changes returning characters to their origins without changing energy.

The cloud environment now has the saved setup/startup instructions and active network access. A read-only attempt to list the project's Firebase web apps confirmed that this workspace does not currently have usable Firebase deployment authentication. The existing web configuration is not a deployment credential.

The application has not been deployed to production. Deployment still requires an authorized Firebase sign-in and a project billing plan that supports Cloud Functions. Follow DEPLOYMENT.md, then perform a post-deployment smoke test.

## GitHub publishing preparation

The keyless GitHub Actions workflow passes Actionlint validation. Four mocked bootstrap tests pass, covering new setup, repeatability, preserving existing cleanup policies, refusing a wrong project or missing billing before changes, and treating access failures as errors. Those tests do not execute Google IAM changes. The backend compiled and all 10 Firebase emulator integration checks passed after configuring the dedicated runtime service-account name.

Google Workload Identity Federation still requires the project owner's one-time Cloud Shell setup. The deployment switch is initially disabled in `.github/deployment.json`. No Google authorization or production deployment is claimed by these local checks.
