Story ID: ST-024

# ST-024 — Retire Google Fit

## Context

Phase 4 of [health-connect-android-roadmap.md](../plans/health-connect-android-roadmap.md). After the Fit REST API shuts down, its source is dead code and its OAuth scopes are an unnecessary consent burden. The owner asked for it together with ST-023 (2026-09-29), before the shutdown: once the browser is a read-only viewer (ST-023), nothing uses Fit.

## Scope

* Delete `src/fit-step-source.js` and its tests; remove the web branch of `selectStepSource`.
* Remove `fitness.activity.read` / `fitness.location.read` from requested scopes; update the Google Cloud consent screen.
* README and `.context/` updated: Health Connect is the only source.

## Out of Scope

* Deleting any stored Fit-era `daily_records`.

## Acceptance Criteria

* `grep -rn "fitness" src/` returns nothing.
* Web viewer and Android app work unchanged; test suite passes.

## Implementation

* `src/fit-step-source.js` (removed), `src/platform/step-source.js`, [auth.js](../../src/auth.js), README, `.context/`.

## As built

* Deleted `src/fit-step-source.js` and its tests. `selectStepSource` returns `{ source: null, connection }` in the browser; `main.js` builds the step sync only when there is a source (the app). The browser's connection module is renamed `src/platform/web/google-account-connection.js` (`createGoogleAccountConnection`; the `google_connected` flag is unchanged, so existing sign-ins still restore silently).
* `src/auth.js` requests `https://www.googleapis.com/auth/drive.appdata` only.
* The service worker bypasses only `googleapis.com/drive/*` (`/fitness/` dropped in `src/sw-policy.js` and its `public/sw.js` mirror); `SW_VERSION` → `step-tracker-v2`.
* The engine tests in `src/steps.test.js` ran through the Fit source with stubbed `fetch`; they now run on `makeFakeSource()` (`src/steps.fixtures.js`), with source failures thrown as `syncFailure(...)`. Two suites that only tested Fit's separate hourly request were removed — Health Connect reads days and the hourly profile in one query, and the engine's hourly persistence stays covered (`_upsertChunk`, `_toDailyRecords`).
* The web manifest description, README (setup: only the Drive API; step sync; offline), AGENTS.md and the `.context` flows no longer describe Google Fit as a source. Earlier slice documents are left as the historical record.
* `grep -rn "fitness" src/` returns nothing; 2,172 tests pass.
* **Owner step:** in Google Cloud Console, remove the Fit scopes from the OAuth consent screen (keep `drive.appdata`) and, optionally, disable the Fitness API.
