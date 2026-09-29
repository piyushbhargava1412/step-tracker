Story ID: ST-023

# ST-023 — Read-Only Web Viewer

## Context

Phase 4 of [health-connect-android-roadmap.md](../plans/health-connect-android-roadmap.md). Once Fit shuts down, the web build has no step source. The Android app is the only writer; the web URL becomes a **viewer** of the latest Drive snapshot the app pushed. The owner asked for ST-023 and ST-024 together with ST-026 (2026-09-29), ahead of the Fit shutdown: the phone has been the step source since v0.1.0.

## Scope

* On web, after sign-in, download the latest Drive snapshot into a separate cache database and render it. The Today status line reads "Data as of {exportedAt}" and its ↻ button (and pull-to-refresh) re-downloads the snapshot.
* Hide every mutating control on web (sync from a step source, overrides, goal changes, challenge edits, home city, history start, prune/wipe, Backup & restore — local restore, Drive push/pull, storage protection) with a "View only — edit in the Step Tracker app" note.
* Data-layer backstop: every Dexie write throws `ReadOnlyError` while the viewer role is active, except the snapshot replacement itself.
* No backup for the signed-in account → friendly message pointing at the app.

## Out of Scope

* Live updates; demo mode.
* Removing Google Fit code or scopes (ST-024).
* Migrating the browser's old editable database (`StepTrackerDB`) — it is left untouched; the viewer uses its own cache database, and the owner's data lives in the app and on Drive.

## Acceptance Criteria

* Web never calls Drive create/update/delete (asserted with Drive mocked).
* After the app pushes, Refresh in the viewer shows the change.
* Clearing site data and reloading still shows data after sign-in.
* Native build unaffected.

## Design

* **Role** — `src/platform/access.js`: `selectAccess({ isNative })` → `{ role: 'editor' | 'viewer', canEdit }`; the app edits, the browser views. `applyAccess(doc, access)` sets `<html data-access>`.
* **Markup gating** — controls that change data carry `data-editor-only`; notes for viewers carry `data-viewer-only`. One CSS rule per attribute hides them by role, so render modules only mark their controls (no role branching). The goal chip is rendered disabled for viewers (`createProgressUI(..., { canEdit })`).
* **Cache database** — `dbNameFor(access)`: `StepTrackerDB` in the app, `StepTrackerViewerDB` in the browser.
* **Backstop** — `src/read-only.js`: a Dexie DBCore middleware rejects every mutation with `ReadOnlyError` while read-only; `writeSnapshot(fn)` runs one `rw` transaction whose writes are allowed (the snapshot replacement).
* **Viewer** — `src/viewer.js`: `refresh()` pulls the snapshot (read-only Drive calls only: the viewer receives just `pull`), replaces `daily_records` + `settings` inside `writeSnapshot`, and records the snapshot's `exported_at` (`viewer_snapshot_at` settings row). It plugs into the existing sync trigger in place of the step sync, so connect, launch restore, resume and ↻ all refresh the snapshot.
* **Side-effect writes** — Journey's achievements cache write becomes best-effort, so rendering never fails in the viewer.

## Implementation

* New `src/platform/access.js`, `src/read-only.js`, `src/viewer.js`, `src/viewer-ui.js`; [db.js](../../src/db.js) database name; `data-editor-only` / `data-viewer-only` marks across `index.html` and the render modules; [main.js](../../src/main.js) wiring; dev dependency `fake-indexeddb` (real IndexedDB in the backstop test).

## As built

* Everything in *Design* above, plus `src/read-only-error.js` (Dexie-free `ReadOnlyError` / `isReadOnlyError`) so pure modules (goal, gamification) can recognise a refusal. Dexie rethrows the middleware's error as a `DexieError` with the same name, so checks go by name.
* `main.js` picks a `refresher` — `{ run, canRun, renderStatus }` — the step sync in the app, the viewer in the browser; the sync trigger, ↻, pull-to-refresh, connect, launch restore and resume all use it. The viewer gets `{ pull }` only.
* Settings in the viewer: the connection row reads **Google Drive**; the Backup row and the settings panel (home city, history start, danger zone) are hidden; a view-only note explains where to edit. The welcome screen says "See the steps your Step Tracker app backs up to your Google Drive." and has no restore button.
* Goal's lazy default write and Journey's achievements cache are refused silently in the viewer.
* Verified: 2,247 unit tests (the backstop and viewer against real Dexie on `fake-indexeddb`); in the dev browser at 390 px — welcome, Today (no storage pill, no challenge set-up card, read-only goal chip, view-only note) and Settings; the refused lazy goal write in a real browser confirmed the backstop. On `localhost`, Dexie's debug mode `console.trace`s each refused write (dev only). **Pending (owner):** sign in on the deployed site and check the data matches the app's latest backup, and that ↻ picks up a new backup.
