# Merging Sun — first playable atlas

A map-centered companion for a medieval fantasy LARP. Built with React, TypeScript, Leaflet, Firebase, and Tiptap.

## Start locally

Use Node.js 22.18 or newer (the Firebase deployment runtime is Node 22).

```bash
npm ci
npm --prefix functions ci
npm run dev
```

The app opens in **local preview** by default. A demo traveler starts in Emberfall with 100 energy. Map edits, character creation, and travel in this mode persist in this browser's local storage. They do **not** affect Firebase or transfer when you sign in.

The placeholder map and all its tiles are checked in. Fonts are served locally. No external map service or API key is required for the map.

In restricted cloud workspaces, pass `--cache /workspace/.npm-cache` to npm installs. Each cloud task already has an isolated checkout; use `/workspace/MergingSunWorldApp`, without creating a worktree unless explicitly requested.

## Included in v0.1

- Pan, wheel and pinch zoom, map tiles, zoom controls, fit world, and find character.
- Searchable cities, towns, and landmarks. Filter by type, open lore, and share a location URL.
- Hex-grid, terrain, territory, and place-label overlays.
- Full-page character creation: name → kingdom map and lore → home city and lore → backstory → optional portrait → private real name → review. Home is both birthplace and starting position.
- Character applications require admin approval. Rejection includes a written reason and supports editing/resubmission. Replacements keep the current character playable until approval, then begin with 100 energy and separate journey history.
- Walking route previews with an energy breakdown, immediate travel, and recent journey history.
- **Landscape** editor with terrain brushes (plains, forest, mountain, water), river and erase-river brushes, three brush sizes, undo/redo for painting and location/boundary creation.
- Location placement, position editing, rich-text lore, headings, lists, quotes, HTTPS images, and links. Lore is sanitized before display.
- **Places** editor: kingdom cards → settlements → internal encyclopedia entries, with rich lore and explicit allegiance transfers.
- Kingdom borders are part of the kingdom. Edit coordinates or draw a replacement; borders cannot be deleted separately. No settlement/border containment calculation is performed.
- Confirmed kingdom deletion removes its border, settlements, and their internal entries. Settlement deletion removes its entries. Characters stay in place and references to deleted places are cleared.
- Locally autosaved world and lore drafts; explicit world publication; world JSON export. The local preview can restore its previous saved world into a draft. Connected world publication keeps server-side version backups.
- Firebase email/password sign-up, sign-in, password reset, and server-managed admin roles with expiring, single-use invitations.
- Firebase Storage uploads for tiled map artwork, private portraits, and kingdom flags/coats of arms, with draft preview and zoom-aware heraldry.
- Settlement population counts, enterable internal locations, and server-enforced shared-room character profiles.
- Responsive desktop and phone layouts, keyboard-accessible controls, and a `/` shortcut for search.

## Places and existing world data

The Places editor starts with kingdoms. Open a kingdom to add a settlement on the map, and open a settlement to add its internal encyclopedia entries. Use **Edit settlement / allegiance** to transfer it, including its entries, to another kingdom. Its position and both borders remain unchanged. Internal entries have stable IDs and support character stays; every settlement also has a built-in Town Commons. Characters on a settlement's hex can enter its internal locations.

World schema version 2 keeps the existing `territories` storage field for kingdom records, so border IDs are preserved. Settlements keep their IDs, coordinates, and lore, gain an explicit `kingdomId`, and contain `entries`. Existing region names are matched only to an exactly named kingdom; no geographic inference is used. Unmatched legacy places are preserved and can be assigned from inside a kingdom. Creating new independent places is deferred. Upgrades are normalized on read and persisted when an admin publishes; no automatic production content write is performed by deployment.

Deleting a kingdom or settlement requires confirmation of its descendants. A transferred settlement is no longer part of its former kingdom's deletion. Character origin/current-place references are cleared only when their target is deleted; position, energy, and journey history are preserved. Deleting the final kingdom is allowed; new character creation waits for a new starting settlement.

## Rules used for the prototype

These are starter balancing values, defined in `shared/world.ts`:

| Rule                   | Value                    |
| ---------------------- | ------------------------ |
| Maximum energy         | 100                      |
| Regeneration           | 1 energy every 5 minutes |
| Walking into plains    | 2 energy                 |
| Walking into forest    | 4 energy                 |
| Walking into mountains | 7 energy                 |
| Road modifier          | 50% of terrain cost      |
| River modifier         | +3 energy on every entry |
| Water                  | Impassable on foot       |
| Approximate distance   | 5 km per hex step        |

Routes minimize energy expenditure using a minimum cost of 1 per step. Roads halve only terrain cost (plains 1, forest 2, mountains 3.5); river surcharges are added in full. Fractions are kept during pathfinding and the final journey total is rounded up once. The starting tile is free. Rivers are tile modifiers, with no directional crossing or spline mechanics. A route's distance counts its steps, including detours. Regeneration is calculated from timestamps on demand, without recurring server jobs. Travel costs and positions are calculated independently on the backend; a browser-provided cost is never trusted.

**Changing grid size or alignment returns characters with a surviving origin to that settlement, without changing energy. Characters whose origin was deleted keep their map position.** The editor explicitly confirms grid changes. Terrain painting transfers by nearest old tile center and should be reviewed. Changing grid visibility does not reset anyone. Deleting a place never moves its characters. Display names and allegiance can change without changing a settlement ID.

The initial grid is pointy-top. Radius can be adjusted from 28–80 map pixels; X/Y offsets can be adjusted from −80 to 80. Only walking is implemented; additional transportation modes are future work.

## Automatic publishing

The recommended release workflow is now [GitHub Actions with keyless Google authorization](GITHUB_DEPLOYMENT.md). Google setup is a one-time browser task; later pushes to `main` can test and deploy automatically. Google authorization is configured and deployment is enabled in `.github/deployment.json`. The live app is https://mergingsunapp-2.web.app.

## Connect the shared Firebase world

The browser configuration for `mergingsunapp-2` is in `src/firebase.ts`. It is public web configuration, not an admin credential. Analytics is intentionally not initialized. Email/password Authentication and a production-mode Firestore database have already been created by the project owner.

**The connected backend and rules must be deployed before saved characters, travel, and shared editing work.** A successful sign-in alone does not mean the world backend is deployed. The UI keeps local preview changes separate and reports backend errors.

For a beginner-friendly deployment walkthrough, see [DEPLOYMENT.md](DEPLOYMENT.md).

From a machine authenticated to the Firebase project:

```bash
npx firebase login
npm run deploy
```

Deployment changes the live project. Review the rules and backend before running that command. Cloud Functions deployment requires the Blaze billing plan. The backend now uses the dedicated `merging-sun-runtime` service account created by the Google setup script. Manual deployments also require this setup. The callable functions use `asia-southeast1`; align this with your database region where practical, and update `VITE_FUNCTIONS_REGION` and the backend region together if needed. Functions are capped at five instances per function; usage and billing should be monitored in the Firebase console.

Add the eventual website hostname to **Authentication → Settings → Authorized domains** if it is not already included. The frontend build creates `dist/`, configured for Firebase Hosting with application route fallbacks. Firebase Storage must be initialized and the custom runtime granted object access on its bucket; see [image storage setup](GITHUB_DEPLOYMENT.md#image-storage-access). Portrait inputs accept JPEG, PNG, or WebP up to 10 MB and are cropped/resized to 512×512 before submission. The backend saves a private WebP object. World maps accept up to 25 MiB, 8192 pixels per side, and 64 megapixels, with progress and private original retention. Flags accept up to 6 MiB; public processed images are cached. Lore images still accept public HTTPS URLs; lore image uploads are not included.

See [the review, image, and occupancy guide](docs/character-review-and-world-images.md) for player/admin workflows, migration behavior, image limits, and privacy rules.

### Admin activation and invitations

Open https://mergingsunapp-2.web.app/admin/activate, sign in, and enter a valid private key. In **World Editor → Admin invitations**, an existing admin can generate a key for any signed-in recipient. Keys use 256 random bits, expire after 24 hours, and can be used once. Their plaintext is shown only to the creator; the database stores a SHA-256 hash as the invitation ID. Unused invitations can be revoked. Generation is limited to five per admin per hour and failed redemptions to ten per account per ten minutes. Successful network retries are idempotent.

The initial deployment includes only a hash, target UID, and expiry in `functions/src/bootstrap.ts`. Its privately delivered key can activate only that account. It creates no role until the matching signed-in owner redeems it, and the same single-use database marker prevents reuse. No plaintext bootstrap key belongs in source control, builds, logs, or URLs. The bootstrap key can be removed from future deployments once used.

For recovery or a future owner-authorized first invitation, on a trusted machine with Google Application Default Credentials for this project:

```bash
npm --prefix functions run invite-admin -- OPTIONAL_TARGET_UID
```

Without a target UID, the first signed-in recipient can redeem the key. Admin activation writes a server-controlled `adminRoles/{uid}` record, and the UI updates without signing out. Backend functions and Firestore rules recognize this role and existing legacy `admin: true` token claims. No Firebase Authentication administration permission is needed for invitations; the runtime's existing Firestore permission suffices.

### Private player details

Real names and portrait references are stored in private character/application records, whose reads are restricted to owners and admins. Image objects live in private Storage. They are never written into the public world document. Character creation drafts are scoped to the signed-in account and current character, saved on the device, and cleared after success. Images can be skipped. Recreation requires explicit confirmation and an expected character generation; approval transactions archive the previous profile, activate a fresh generation, and prevent late travel from moving the replacement. Legacy characters keep their existing journeys until recreated.

Players cannot write character energy, positions, worlds, or journeys directly to Firestore. `createCharacter`, `travel`, and `publishWorld` are authenticated callable functions. World publishing requires a server-managed admin role or a legacy `admin: true` claim. Private records and travel histories remain owner/admin-only. A server-filtered character profile (name, title, backstory, origin, portrait) is available only to characters sharing an internal location. World content and settlement population counts are public.

Travel uses transactions and idempotency request IDs. World publication checks versions to prevent one admin overwriting another's work and backs up the previous version. For this first version, publication supports up to 400 characters in one transaction and up to 800 KB of world data. Larger populations need a batched migration/maintenance workflow; publication explicitly refuses to proceed beyond the limit.

## Validate

```bash
npm test
npm run build
npm run build:backend
npm run test:e2e
npm run test:auth
npm run test:connected-ui
```

Playwright uses `/usr/bin/chromium` by default; set `CHROMIUM_PATH` to your browser binary elsewhere. It starts or reuses Vite on port 5173. `npm run test:auth` runs four real browser authentication checks against the local Auth emulator, including registration, session persistence, sign-in, and password reset. It needs no Firestore emulator download.

The browser suite covers map loading, lore deep links, character creation, energy-based travel, history persistence, editor changes, undo, grid-origin resets, and mobile controls.

### Firebase emulator integration

Java 21+ and the Firebase CLI are required. The CLI is included as a development dependency. Tests use **`demo-merging-sun`**, never your production project.

```bash
npm run build:backend
npm run test:firebase
```

The initial Firestore emulator download requires `storage.googleapis.com`. The CLI validates the downloaded artifact; do not disable verification. In the cloud workspace use:

```bash
XDG_CONFIG_HOME=/workspace/.firebase-config \
FIREBASE_EMULATORS_PATH=/workspace/.firebase-emulators \
npm run test:firebase
```

The integration suite checks character ownership, denied direct writes, admin permissions, authoritative travel pricing, duplicate-request idempotency, insufficient energy, stale world versions, and origin resets. It must pass before declaring the connected backend verified.

For interactive emulator development, run `npm run emulators`, then start a separate frontend process with `VITE_FIREBASE_EMULATORS=true npm run dev`. Use test email addresses and passwords. The flag switches Firebase clients to the isolated demo project and local emulator ports. Emulator state is disposable unless you explicitly export it.

## Replace the placeholder artwork

The current illustrated source is `public/map/world.svg`, generated by `scripts/generate-map.mjs` from `shared/geography.ts`. `npm run map:generate` rebuilds the sample SVG and its tile pyramid. It is deterministic and should only be run when regenerating that sample.

For your own map, use **World editor → Landscape → Map artwork**. Natural image proportions, upload/processing progress, private originals and placement alignment are supported; see [the map guide](docs/character-review-and-world-images.md).

The optional offline script below replaces only the legacy 4:3 placeholder tiles. It is not the admin upload flow:

```bash
node scripts/tile-map.mjs /absolute/path/to/your-map.png
```

This normalizes the artwork to the existing 2400×1800 map coordinate system, creates the four-level tile pyramid and an overview, and replaces the served map tiles. It does not move locations or change terrain rules. Back up your world before replacing artwork. The existing procedural sample terrain will still exist: clear/reset its rules and repaint them for your real world as a separate map-authoring step. Updating the image alone cannot infer accurate terrain.

## Current boundaries

The app is a first playable version deployed through GitHub Actions. It has no boats or horses, inventory, combat, multiplayer presence, secret lore, player-visible public character directory, general image-upload service, or continuously running simulation. Character profile edits and admin energy adjustments are not included yet. Geometry changes reset positions only; they do not refund travel or replenish energy. Server backups are retained in `worldBackups`; the admin restore UI for those backups is a future improvement. Local draft autosave can be limited by browser storage capacity; export important work.
