Story ID: ST-021

# ST-021 — Background Sync

## Context

Phase 3 of [health-connect-android-roadmap.md](../plans/health-connect-android-roadmap.md). The PWA only syncs when opened. On Android the app can refresh steps periodically so the streak, widgets and Drive backup are current without opening it.

## Scope

* Spike: Capacitor background runner vs. a small native WorkManager worker that invokes the JS sync via the plugin bridge. Pick the one that can run the existing engine headless; record under *As built*.
* Periodic sync (≥15 min, default hourly) with `READ_HEALTH_DATA_IN_BACKGROUND`, requested only when the user enables "Background sync" in Settings.
* Optional end-of-day notification when the step goal is not yet met (off by default).

## Out of Scope

* Home-screen widgets.

## Acceptance Criteria

* With the app closed for 2 hours, opening it shows steps synced within the last hour.
* Disabling the setting cancels the scheduled work.
* No background work is scheduled without the background-read permission.

## Implementation

* `src/platform/background.js` (+ native), `android/` worker, [settings.js](../../src/settings.js), [settings-ui.js](../../src/settings-ui.js).
