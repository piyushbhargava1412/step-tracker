Story ID: ST-018

# ST-018 — Platform Adapter Layer

## Context

Phase 2 of [health-connect-android-roadmap.md](../plans/health-connect-android-roadmap.md). Browser-only APIs are called directly today: Google Identity Services in [auth.js](../../src/auth.js), anchor downloads in the backup/export modules, `navigator.storage.persist()` in [storage.js](../../src/storage.js)/[storage-health.js](../../src/storage-health.js), and service-worker registration. This slice moves each behind `src/platform/` **with web implementations only**, so ST-019/ST-020 add native implementations without touching feature modules.

## Scope

* `src/platform/capabilities.js`: `{ isNative }` from `Capacitor.isNativePlatform()` (false on web without importing Capacitor at runtime cost).
* `src/platform/auth.js`: facade over today's token client (`requestToken`, `getAccessToken`, `signOut`), scopes passed in by the caller.
* `src/platform/files.js`: `saveTextFile(name, mime, text)` used by backup export and Search Lab CSV export.
* `src/platform/storage-persistence.js`: `persist()` / `persisted()`; on native both resolve `true` (app storage is not evicted).
* `src/platform/step-source.js`: `selectStepSource({ isNative, ... })` — returns the Fit source on web. ST-019 adds the native branch.
* Each adapter chooses its implementation in one place; **no throwing native stubs** (the web implementation also runs in the APK until replaced).

## Out of Scope

* Any native implementation.

## Acceptance Criteria

* `grep` finds no `google.accounts`, `a.download =` or `navigator.storage.persist` outside `src/platform/web/`.
* Web behavior identical; all existing tests pass; adapters have unit tests.

## Implementation

* New `src/platform/{capabilities,auth,files,storage-persistence,step-source}.js` + `web/` implementations; call sites in [auth.js](../../src/auth.js), [backup-ui.js](../../src/backup-ui.js), [exporter.js](../../src/exporter.js), [storage.js](../../src/storage.js), [storage-health.js](../../src/storage-health.js), [main.js](../../src/main.js).
