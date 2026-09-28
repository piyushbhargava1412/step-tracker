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

## As built

* `appId` `com.piyushbhargava.steptracker`, `capacitor.config.json` (JSON — the repo has no TypeScript). Background `#020617` matches the icon and page.
* **Native build mode** is a small Vite plugin (`scripts/native-html.js`, tested) that strips the manifest link. The service worker is kept out at runtime instead: `main.js` passes `prod: import.meta.env.PROD && !isNative` to `createSwRegister`.
* **minSdk raised 24 → 26**: Health Connect and the health plugin require Android 8.0.
* **Gradle daemon pinned to JDK 21** (`android/gradle/gradle-daemon-jvm.properties`): Gradle 8.14 can't compile the health plugin's build script on JDK 25.
* Icons/splash: `scripts/generate-android-assets.sh` (macOS `sips`) scales `public/icons/icon-512.png`; adaptive-icon background set to `#020617`.
* Release signing reads `ST_RELEASE_*` from `~/.gradle/gradle.properties`; the keystore itself is **not generated yet** — steps in [android-release.md](../plans/android-release.md). Needed before ST-022.
* `WRITE_EXTERNAL_STORAGE` (maxSdk 29) added for exports on Android ≤ 10 (ST-018).
* Verified on a Pixel 9 emulator (Android 17): installs, launches, no service worker, data survives relaunch.
