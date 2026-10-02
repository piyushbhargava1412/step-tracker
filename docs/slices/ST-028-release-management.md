Story ID: ST-028

# ST-028 — Release Management and "Check for Updates" in Settings

## Context

Releases were cut by hand: a `chore(release)` commit bumped `package.json`, `versionName` and
`versionCode` in `build.gradle` separately, and the signed APK was built locally and uploaded to a
GitHub pre-release with hand-written notes. The app had no way to tell the owner that a newer build
existed ("No automatic updates: download newer releases from this page").

The owner asked to bring over the tuition-manager app's release management and its Settings
"Check for updates".

## Scope

* **One version source** — `package.json`. Gradle derives `versionName` and
  `versionCode = major×10000 + minor×100 + patch`.
* **`npm run release`** — `npm version` with a `chore(release): v%s` message: bump, commit, tag.
* **Release workflow** — on a `v*` tag: check tag = package.json, test, build, sign, verify the
  signature, publish a GitHub Release on this repo with `step-tracker-<version>.apk`, notes from
  commit subjects plus checksums. Pre-release while the major version is 0.
* **Settings › App › Check** (Android app only) — lists the repo's releases (pre-releases included),
  shows the newer version's "What's new", and **Install** downloads the APK in the app and opens
  Android's installer, falling back to the browser.

## Differences from tuition-manager

* Same repo, not a separate public releases repo: this repo is public, so the built-in
  `GITHUB_TOKEN` publishes and the app reads without a token.
* The check lists releases instead of `/releases/latest`, because every Android build so far is a
  pre-release and `/latest` skips those.
* Gradle reads the version from `package.json` instead of `-PappVersionName` flags, so local builds
  and the Settings version line always match the tag.
* Release notes are shown as plain text from the "What's new" section only.
* No launch-time banner or 12-hour cache: the check runs only when the user taps Check.

## Out of Scope

* A launch-time "update available" banner.
* Play Store distribution (ST-022).

## Acceptance Criteria

* `npm run release -- patch` then `git push --follow-tags` produces a signed GitHub Release
  without manual steps; a tag that disagrees with `package.json` fails the run.
* Settings in the app shows App › Updates with the installed version; Check reports latest, newer
  (with notes and Install) or a failure; the web viewer shows no such row.
* Install downloads in the app, explains a missing "Install unknown apps" permission, and falls back
  to the browser on any other failure.
* Tests for version parsing and comparison, release selection, notes cleanup, the checker, the UI
  states, the installer error mapping, the wiring, the markup, and guards for the plugin, manifest,
  Gradle version and workflow.

## As built

* New `src/app-update.js`, `src/update-ui.js`, `src/platform/native/apk-installer.js`,
  `android/.../ApkUpdaterPlugin.java`, `.github/workflows/release-android.yml`,
  `scripts/release-management.test.js`; edited `MainActivity.java` (register plugin),
  `AndroidManifest.xml` (`REQUEST_INSTALL_PACKAGES`), `app/build.gradle` (version from
  package.json), `index.html` (`#app-update`, hidden), `styles.css` (`.app-update__*`),
  `src/main.js` (native-only wiring), `package.json` (`release` script).
* Verified: full Vitest suite; `assembleDebug` builds with versionName 0.4.0 / versionCode 400;
  `actionlint` clean; the Settings group against the live GitHub API in the dev server (installed
  0.3.9 → "Version 0.4.0 is available." with the What's new bullets).
* Not yet verified: a full tag → release run (needs the four `ANDROID_*` secrets) and an on-device
  install from a release build.
