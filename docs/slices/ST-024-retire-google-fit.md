Story ID: ST-024

# ST-024 — Retire Google Fit

## Context

Phase 4 of [health-connect-android-roadmap.md](../plans/health-connect-android-roadmap.md). After the Fit REST API shuts down, its source is dead code and its OAuth scopes are an unnecessary consent burden.

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
