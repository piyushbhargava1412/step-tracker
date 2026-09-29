# Flow: Read-Only Web Viewer (ST-023)

<!-- context-meta
verification-commit: (ST-023 branch)
generated-at: 2026-09-29T00:00:00Z
confidence: high
-->

## Overview
The Android app is the only writer. The browser build (the Cloudflare Pages site / PWA) is a
**viewer**: after Google sign-in it downloads the latest backup the app pushed to Google Drive
(`appDataFolder`) into its own cache database and renders every screen from it. Nothing in the
browser can change data, locally or on Drive.

## Entry Points
- **Type**: UI Event + automatic — the same sync trigger the app uses
- **Path/Topic**: Settings/welcome **Connect Google Account** → `connection.onConnected` →
  `syncTrigger.run()`; launch with the `google_connected` flag → silent token → same; Today's ↻
  button and pull-to-refresh → `syncTrigger.run()`; returning to the tab after ≥ 10 min →
  `syncTrigger.runIfStale()` (ST-021). In the viewer each of these runs `viewer.refresh()`
  instead of the step sync.
- **File**: `src/main.js` (wiring: `selectAccess`, `applyAccess`, `dbNameFor`, `guardWrites`,
  `createViewer`, the `refresher` adapter), `src/viewer.js`, `src/viewer-ui.js`

## Core Path
1. `selectAccess({ isNative })` (`src/platform/access.js`) → `{ role: 'viewer', canEdit: false }`
   in the browser, `{ role: 'editor', canEdit: true }` in the app. `applyAccess` sets
   `<html data-access="viewer">`.
2. `createDb(dbNameFor(access))` opens **`StepTrackerViewerDB`** (the app keeps `StepTrackerDB`;
   an old editable browser database is left untouched). `guardWrites(db, { isReadOnly })`
   (`src/read-only.js`) installs a Dexie DBCore middleware: every mutation throws
   `ReadOnlyError` (`src/read-only-error.js`; Dexie rethrows it as a `DexieError` with the same
   name → `isReadOnlyError(err)` checks the name) unless it runs inside `writeSnapshot(fn)` — one
   `rw` transaction over all tables whose IndexedDB transaction is allow-listed.
3. `viewer.refresh()`: not connected → `NOT_CONNECTED_MESSAGE`; `driveSync.pull()` (the viewer is
   handed `{ pull }` only — no push, no metadata writes) → null → `NO_BACKUP_MESSAGE` (points at
   the app's Backup & restore); otherwise `writeSnapshot` clears `daily_records` + `settings`,
   bulk-puts the snapshot's rows and stores `viewer_snapshot_at = exported_at`; a toast confirms.
   Any failure → `LOAD_FAILED_MESSAGE`, previous data kept. Never throws.
4. The pipeline re-renders every data view, then `renderViewerStatus(doc, snapshotAt)` writes
   `#last-sync` "Data as of Sep 28, 2026 · 22:31" (or "No data yet") and relabels `#sync-btn`
   "Refresh from Google Drive". The same runs at startup from the cached snapshot.
5. **Markup gating** (styles.css): `[data-access="viewer"] [data-editor-only] { display: none }`,
   `:root:not([data-access="viewer"]) [data-viewer-only] { display: none }`. Editor-only: the
   `#backup-status` pill (ST-027), Settings › Backup row + `#settings-panel` (home city, history start, danger
   zone), welcome **Restore from a backup**, calendar **Correct steps** / **Revert to synced**,
   search **Edit Day**, challenge edit button + config form, and the "set up a challenge" summary.
   Viewer-only: `.viewer-note` on Today and Settings. The goal chip is rendered disabled
   (`createProgressUI(..., { canEdit })`, styled as a label).
6. Reads that write as a side effect are fail-open by design: goal's lazy default write and
   Journey's achievements cache ignore `ReadOnlyError` (no log).

## Data Touchpoints
- `StepTrackerViewerDB`: `daily_records`, `settings` (snapshot rows + `viewer_snapshot_at`).
- Drive: `files.list` + `files.get?alt=media` only.

## Integrations
- Google Identity Services (browser token), Google Drive REST (read).

## Scope
- `src/platform/access.js`, `src/read-only.js`, `src/read-only-error.js`, `src/viewer.js`,
  `src/viewer-ui.js`, `src/db.js` (`VIEWER_DB_NAME`, `dbNameFor`), `src/main.js`, `index.html`,
  `styles.css`, the `data-editor-only` marks in `calendar-ui.js`, `search-ui.js`,
  `challenge-ui.js`; `progress-ui.js` (`canEdit`), `onboarding-ui.js` (`intro`), `goal.js`,
  `gamification.js`.

## Tests
- `src/read-only.test.js`, `src/viewer.test.js` (real Dexie on `fake-indexeddb`),
  `src/viewer-ui.test.js`, `src/platform/access.test.js`, `src/db.test.js`, `src/main.test.js`
  ("ST-023 read-only web viewer": role, database, snapshot load, **no Drive writes** across
  connect/refresh/resume, status line), `src/index.test.js`, `src/styles.test.js`, and the
  module tests asserting `data-editor-only`.

## Notes
- On `localhost` Dexie runs in debug mode and `console.trace`s each refused write — dev-server
  noise only; the deployed site has debug off.
- Since ST-024 the browser's Google sign-in asks for `drive.appdata` only and the browser builds
  no step source or step sync at all (`selectStepSource` → `{ source: null, connection }`).
