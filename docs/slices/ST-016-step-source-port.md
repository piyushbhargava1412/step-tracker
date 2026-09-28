Story ID: ST-016

# ST-016 — StepSource Port (Fit behind an interface)

## Context

Phase 1 of [health-connect-android-roadmap.md](../plans/health-connect-android-roadmap.md). Today [steps.js](../../src/steps.js) is both the sync engine (windows, chunking, upsert, backfill latch, Drive hook) and the Google Fit client (endpoint, request body, retry policy, bucket parsing). Health Connect (ST-019) needs to reuse the engine with a different data source. This slice splits the two along a `StepSource` port. **No user-visible behavior change.**

## Scope

* New `src/step-source.js`: the port contract (JSDoc typedef) plus the classified-failure vocabulary shared by every source: `SYNC_ERROR_NAME`, `FAILURE_*` constants and `syncFailure()`.
  * `StepSource = { label, notReadyMessage, accessLostMessage, isReady(), fetchDays(chunk, ctx) }`
  * `fetchDays({ startMs, endMs }, { index, total, phase })` resolves to `DayReading[]`: `{ date: 'YYYY-MM-DD', steps: number, distanceKm: number|null, hourlySteps: number[24]|null }`. `distanceKm: null` means the source has no distance for that day.
  * A source throws a `syncFailure(...)` for classified failures; anything else is treated as a persistence/unknown failure by the engine.
* New `src/fit-step-source.js`: `createFitStepSource(auth, reporter, fetchFn)`. Owns the Fit endpoint, data types, bucket sizes, retry/backoff policy, the parallel non-fatal hourly fetch and all bucket parsing. Returns `DayReading[]`.
* [steps.js](../../src/steps.js) becomes source-agnostic:
  * `createStepSync(source, db, reporter, doc, driveSync, backup, driveBackupPrefs)` — first argument is a `StepSource` instead of `auth`.
  * Pre-flight guard uses `source.isReady()` / `source.notReadyMessage`.
  * New `_toDailyRecords(readings)` owns the domain rule "estimate distance as `steps × STEP_TO_KM` when the source has none".
  * User-facing messages use `source.label` instead of the literal "Google Fit".
* [main.js](../../src/main.js) composes `createFitStepSource(auth, reporter)` and injects it.
* Tests move with the code: Fit parsing/fetch/retry tests to `src/fit-step-source.test.js`; engine tests keep exercising Fit end-to-end through the real Fit source with `fetch` stubbed.

## Out of Scope

* Any Health Connect code (ST-019).
* Changing the sync windows, backfill latch or Drive hook behavior.
* Fixing the stale "since 2013" wording in the backfill status message (tracked separately).

## Acceptance Criteria

* `steps.js` contains no Fit URL, data-type name, bucket parsing or `getAccessToken` call; `grep -n "googleapis\|com.google" src/steps.js` returns nothing.
* `fit-step-source.js` is the only module that calls the Fit REST API.
* Every user-facing status string produced by a Fit sync is byte-for-byte unchanged.
* A fake `StepSource` (no `fetch`) can drive a full `sync()` run in tests, proving the engine has no hidden Fit dependency.
* `npm test` passes; each new module ≥80% statement coverage, 100% on guard/error paths.
* `.context/` (repo map, historical-step-sync flow) reflects the new module boundary.

## Implementation

* New `src/step-source.js`, `src/fit-step-source.js`, `src/fit-step-source.test.js`, `src/step-source.test.js`.
* [steps.js](../../src/steps.js), [steps.test.js](../../src/steps.test.js), [main.js](../../src/main.js), [main.test.js](../../src/main.test.js).
