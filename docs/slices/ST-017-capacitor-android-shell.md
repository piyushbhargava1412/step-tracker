Story ID: ST-017

# ST-017 — Capacitor Android Shell

## Context

Phase 2 of [health-connect-android-roadmap.md](../plans/health-connect-android-roadmap.md). Package the existing Vite build as an Android app with Capacitor so Health Connect (ST-019) has a native host. The data layer is unchanged: Dexie keeps using IndexedDB, which inside the app lives in app-private storage.

## Scope

* Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`. `capacitor.config.json` with a permanent `appId` (e.g. `com.piyushbhargava.steptracker`), `appName: 'Step Tracker'`, `webDir: 'dist'`.
* Commit the generated `android/` project; git-ignore its build outputs.
* **Native build mode:** `vite build --mode native` sets `VITE_PLATFORM=native`, does **not** register `public/sw.js` and omits the manifest link. The web build is unchanged.
* npm scripts: `build:native`, `cap:sync`, `android:open`, `android:run`.
* App icon and splash from the existing `public/icons/` via `@capacitor/assets`.
* Release keystore generated and its storage documented in `docs/plans/android-release.md` (passwords from `~/.gradle/gradle.properties`, never the repo).

## Out of Scope

* Health Connect (ST-019), native sign-in (ST-020). Inside the APK the Fit/Google sign-in may fail; this is expected.

## Acceptance Criteria

* `npm run build` output unchanged (service worker + manifest still present).
* `npm run build:native && npx cap sync android` builds a debug APK that launches to the app shell with no service worker registered.
* IndexedDB data created in the app survives force-stop and reboot.
* Keystore location and recovery documented; keystore not in git.
* Existing Vitest suite passes.

## Implementation

* [vite.config.js](../../vite.config.js), [main.js](../../src/main.js) (SW registration gated on platform), [index.html](../../index.html), `package.json`, `.gitignore`, new `capacitor.config.json`, `android/`.
