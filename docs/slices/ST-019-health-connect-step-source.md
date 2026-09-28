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
