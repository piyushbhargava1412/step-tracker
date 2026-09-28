Story ID: ST-019

# ST-019 — Health Connect StepSource

## Context

Phase 2 of [health-connect-android-roadmap.md](../plans/health-connect-android-roadmap.md). The core migration: inside the Android app, steps and distance come from Health Connect instead of Google Fit. Thanks to ST-016 this is a new `StepSource` implementation plus selection in ST-018's `selectStepSource`; the sync engine is not edited.

## Scope

* **Spike (first):** pick the Capacitor Health Connect plugin. Must support: aggregate steps + distance grouped by local-day period, hourly aggregation, `READ_STEPS`, `READ_DISTANCE`, `READ_HEALTH_DATA_HISTORY`, availability check (installed / needs update / unsupported). Record the choice here under *As built*.
* `src/health-connect-step-source.js`: `createHealthConnectStepSource(plugin, reporter)` implementing `StepSource`:
  * `label: 'Health Connect'`, `isReady()` = available **and** read permissions granted.
  * `fetchDays` aggregates by local-date period (`LocalDateTime` bounds, so DST/timezone are handled by the platform) and by 1-hour duration for `hourlySteps`. Missing distance → `distanceKm: null` (engine applies the estimate).
  * Permission revoked → `syncFailure(FAILURE_AUTH_EXPIRED)`; `accessLostMessage` tells the user to re-grant in Health Connect.
* **Connect flow on native:** the "Connect" button requests Health Connect permissions (not Google OAuth). If Health Connect is missing/outdated (Android ≤ 13), deep-link to its Play Store page.
* **History policy:** the sync window logic is unchanged. Days already in `daily_records` are re-read only inside the incremental safety buffer; the high-water mark in `_upsertChunk` guarantees Health Connect can never lower a stored Fit-era day.
* `AndroidManifest.xml`: health permissions, the permissions-rationale activity alias, and `<queries>` for the Health Connect package.

## Out of Scope

* Background sync (ST-021), Drive in the app (ST-020).
* Writing data to Health Connect.

## Acceptance Criteria

* On a device with Fit-era data restored from a backup file, a sync fills days from the last stored day to today from Health Connect and leaves older rows untouched.
* Daily totals for 7 sample days match the Health Connect app (or Fit app) within ±1%.
* Hourly chart renders for Health Connect days.
* Revoking permission produces the access-lost message and no crash; re-granting resumes.
* Unit tests with the plugin mocked: aggregation mapping, null distance, permission states, availability states, failure classification.

## Implementation

* New `src/health-connect-step-source.js` (+ test); native branch in `src/platform/step-source.js`; `android/app/src/main/AndroidManifest.xml`.

## As built

**Plugin: `@capgo/capacitor-health` 8.x** (MPL-2.0). Chosen over `capacitor-health` (mley) because it aggregates **distance** as well as steps and supports `requestHistoryAccess` (`READ_HEALTH_DATA_HISTORY`). Its "day" bucket is a fixed 24-hour duration from the query start (drifts off calendar days across DST), so the source requests **hourly** buckets and sums them per local calendar date — exact days *and* the 24-hour profile from one call (720 buckets per 30-day chunk, under Health Connect's 5,000 limit). The plugin only returns non-empty buckets, so the source zero-fills every day in the chunk, like Fit.

* `src/health-connect-step-source.js` — `createHealthConnectStepSource(health, reporter)`. Distance is best-effort (a failed/denied distance read → `distanceKm: null`, engine estimates). Plugin rejection with code `permission-denied` → `FAILURE_AUTH_EXPIRED`; anything else → new `FAILURE_SOURCE_ERROR` ("Health Connect data could not be read").
* **Port change:** `isReady()` may return a promise. The engine claims its re-entrancy guard first, awaits only asynchronous answers (Fit's stays synchronous — button state unchanged), and treats a rejected check as not ready.
* **Connections** (`src/platform/web/google-fit-connection.js`, `src/platform/native/health-connect-connection.js`): `{ label, connect(), restore(), onConnected() }`. The Google one absorbs the silent-restore flag logic previously inline in `main.js`. The Health Connect one requests access (steps + distance + history), links to the Play Store when Health Connect is missing/outdated, and at launch auto-syncs when access was granted before.
* **Manifest:** only `READ_STEPS`, `READ_DISTANCE`, `READ_HEALTH_DATA_HISTORY`; the plugin's other ~45 health permissions are stripped, guarded by `scripts/android-manifest.test.js` (the merged APK was checked with `aapt` — it caught `*_VO2_MAX` leaking through, now fixed).
* **Found on device:** the pre-sync empty-DB Drive recovery wrote "Google Account not connected" into the connection status. `drive-sync.pull({ silent })` now mirrors `push`, and the engine's background recovery is silent.
* **Verified on a Pixel 9 emulator (Android 17, real Health Connect):** permission sheet lists exactly Steps + Distance, then the history prompt; seeded samples synced exactly (daily totals, local-hour profile, measured and estimated distance, zero-filled days); a 40-day-old record was read after a fresh full backfill (history access works); relaunch reconnects and syncs automatically.
* **Behaviour to know:** Health Connect aggregates honour the user's **data-source priority list** — the app shows the same de-duplicated totals as the Health Connect app, and a source not on that list is excluded. Data that reaches Health Connect more than 3 days late (outside the incremental safety buffer) is not picked up, same as with Fit.
* **Not done:** the Health Connect "privacy policy" link in the permission sheet has no page yet (ST-022).
