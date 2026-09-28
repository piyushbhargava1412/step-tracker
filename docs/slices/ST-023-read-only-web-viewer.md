Story ID: ST-023

# ST-023 — Read-Only Web Viewer

## Context

Phase 4 of [health-connect-android-roadmap.md](../plans/health-connect-android-roadmap.md). Once Fit shuts down, the web build has no step source. The Android app is the only writer; the web URL becomes a **viewer** of the latest Drive snapshot the app pushed.

## Scope

* On web, after sign-in (`drive.appdata` only), download the latest Drive snapshot into a separate cache database and render it. Banner: "Viewing data as of {exportedAt} · Refresh".
* Hide/disable every mutating control on web (Sync Steps, overrides, goal changes, challenge edits, prune/wipe, restore, push) with a "View only — edit in the app" hint.
* Data-layer backstop: mutating functions throw `ReadOnlyError` when the viewer role is active.
* No backup for the signed-in account → friendly empty state.

## Out of Scope

* Live updates; demo mode.

## Acceptance Criteria

* Web never calls Drive create/update/delete (asserted with Drive mocked).
* After the app pushes, Refresh in the viewer shows the change.
* Clearing site data and reloading still shows data after sign-in.
* Native build unaffected.

## Implementation

* `src/platform/access.js` (roles), viewer data source over [drive-sync.js](../../src/drive-sync.js), [db.js](../../src/db.js) database name by platform, UI gating across `src/*-ui.js`.
