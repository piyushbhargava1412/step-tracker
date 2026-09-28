Story ID: ST-021

# ST-021 — Sync When the App Returns to the Foreground

## Context

Phase 3 of [health-connect-android-roadmap.md](../plans/health-connect-android-roadmap.md). Originally "background sync". A spike showed that true closed-app sync can't reuse the sync engine: `@capacitor/background-runner` runs JavaScript **outside** the WebView (no IndexedDB, no Health Connect plugin, no DOM), so a native WorkManager job could at most read Health Connect and upload a small "latest days" file for the web viewer. Meanwhile the app already syncs on a cold start — but Android usually keeps it in memory, and **reopening it from Recents did not sync**. Decision (owner, 2026-09-28): do resume sync now; decide on native background work after ST-023, once the web viewer's staleness is visible.

## Scope

* Sync when the app comes back to the foreground: Capacitor `App` `resume` in the Android app, `visibilitychange → visible` in the browser (a PWA tab left open catches up too).
* One sync trigger for every sync (button, connect, launch restore, resume) that remembers when the last sync started; a resume syncs only if the source is connected **and** the last sync started ≥ 10 minutes ago. Silent otherwise (no "connect first" nagging on resume).

## Out of Scope

* Native WorkManager background sync, `READ_HEALTH_DATA_IN_BACKGROUND`, end-of-day notifications — revisit after ST-023.

## Acceptance Criteria

* Reopening the app from Recents after ≥ 10 minutes syncs without a tap.
* Reopening within 10 minutes of any sync does not sync again.
* A resume while not connected shows no message and does not sync.
* Tests for the trigger (cooldown, readiness, failure), the lifecycle adapter (both platforms) and the wiring.

## Implementation

* New `src/sync-trigger.js`, `src/platform/app-lifecycle.js`; `stepSync.canSync()` in [steps.js](../../src/steps.js); wiring in [main.js](../../src/main.js); dependency `@capacitor/app`.

## As built

* `createSyncTrigger({ sync, canSync, now, cooldownMs })` → `run()` (always) / `runIfStale()` (resume). The cooldown counts from when a sync **started**, so a failing sync isn't retried on every resume; a resume skipped for lack of connection does not start it. `RESUME_SYNC_COOLDOWN_MS` = 10 min.
* `stepSync.canSync()` reuses the engine's readiness check — no status message, no fetch.
* `onAppResume({ isNative, doc }, listener)`; the native listener is registered synchronously and failures are logged.
* **Verified on the Pixel 9 emulator:** installed without Health Connect access (no sync at launch) → backgrounded → access granted → reopened from Recents ("task brought to the front", same process) → the app read Health Connect immediately; reopening again within the cooldown made zero Health Connect reads.
