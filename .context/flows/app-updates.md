# Flow: Release Management & In-App Updates

> ST-028 (2026-10-01). Ported from the tuition-manager app's release workflow and update check,
> adapted to this repo: releases live on this public repo (no separate releases repo or token), the
> check includes pre-releases, and package.json is the single source of the version.

<!-- context-meta
verification-commit: HEAD (ST-028)
generated-at: 2026-10-01T00:00:00Z
confidence: high
-->

## Overview
A release starts as a version bump committed on the feature branch with the work. Merging it to `main`
makes `tag-release.yml` create the `vX.Y.Z` tag, which builds the signed APK in GitHub Actions and publishes it as a
GitHub Release on `piyushbhargava1412/step-tracker` with `step-tracker-X.Y.Z.apk` attached. In the
Android app, **Settings › App › Check** lists the repo's releases, and when one is newer than the
installed version it shows the "What's new" notes and **Install version X.Y.Z**, which downloads
the APK in the app and opens Android's installer. The web viewer has no update row: its service
worker updates the PWA (see [pwa-offline-install.md](pwa-offline-install.md)).

## Entry Points
- **Type**: CLI — `npm run release -- patch|minor|major` (`npm version --no-git-tag-version`: bumps
  `package.json`/`package-lock.json` only) on the feature branch, committed as `chore(release): vX.Y.Z`.
- **Type**: Agent — when finishing work on a branch, coding agents propose a bump level and, on the
  owner's yes, commit the bump on that branch via the `/release` skill (`.claude/skills/release/SKILL.md`,
  required by AGENTS.md › Releases).
- **Type**: CI — `.github/workflows/tag-release.yml` on `push` to `main` touching `package.json`: tags
  `vX.Y.Z` when the version is above the latest tag (exists → no-op; lower → fail) and dispatches
  `release-android.yml --ref vX.Y.Z` (a `GITHUB_TOKEN` tag push doesn't fire the tag trigger).
- **Type**: CI — `.github/workflows/release-android.yml` on `push` of a `v*` tag or `workflow_dispatch`.
- **Type**: UI Event — `[data-action="check-update"]` / `[data-action="install-update"]` in
  `#app-update` (delegated click listener in `src/update-ui.js`).
- **File**: `src/app-update.js`, `src/update-ui.js`, `src/platform/native/apk-installer.js`,
  `android/app/src/main/java/com/piyushbhargava/steptracker/ApkUpdaterPlugin.java`, `src/main.js` (wiring).

## Versioning
- `package.json` `version` is the only version. `android/app/build.gradle` parses it
  (`JsonSlurper`), fails the build unless it is `x.y.z` with minor and patch below 100, and sets
  `versionName` = `x.y.z`, `versionCode` = `major*10000 + minor*100 + patch` (0.4.0 → 400; before
  ST-028 the codes were hand-set 2–6). Vite injects the same version as `__APP_VERSION__`.

## Release workflow (`release-android.yml`)
0. `check` job: `gh release view "$TAG"` — a release already exists → `release` job skipped (green
   no-op; covers a re-pushed tag or a re-dispatch); "release not found" → build; any other error → fail.
1. Tag must equal `v` + `package.json` version, else fail.
2. `npm ci` → `npm test` → `npm run cap:sync` (`VITE_CLIENT_ID` from `GOOGLE_CLIENT_ID`).
3. Keystore from `ANDROID_KEYSTORE_BASE64` (missing → fail); `./gradlew assembleRelease` with
   `ORG_GRADLE_PROJECT_ST_RELEASE_*` env vars (the existing `ST_RELEASE_*` signing properties).
4. `apksigner verify --print-certs` must report a certificate, else fail.
5. Notes: `## What's new` = commit subjects since the previous `v*` tag (no merges, no
   `chore(release)`), then install steps, then version/build/commit, APK SHA-256, signing-cert SHA-256.
6. `gh release create` with the built-in token (`permissions: contents: write`), `--verify-tag`;
   `--prerelease` and title "Step Tracker vX.Y.Z (Android, pre-release)" while major is 0.

## Update check (`src/app-update.js`)
- `createUpdateChecker({ installedVersion, fetchFn })` — throws at construction without a parseable
  version. `check()` → `GET https://api.github.com/repos/piyushbhargava1412/step-tracker/releases?per_page=20`
  (`Accept: application/vnd.github+json`, `cache: 'no-store'`); non-2xx throws `Update check failed (status)`.
- `newestRelease(list)` — skips drafts, non-version tags and releases without an `.apk` asset with a
  download URL; **includes pre-releases** (GitHub's `/releases/latest` ignores them, and every build
  so far is one); picks the highest version numerically.
- Returns `{ version, notes, apkUrl }` only if strictly newer than installed (`isNewerVersion`,
  "0.4" == "0.4.0"); a local build ahead of GitHub sees "latest".
- `plainReleaseNotes(body)` — keeps only the `## What's new` section when present; strips heading
  markers, `**`/`*`/backticks, word-bounded `_`/`__`, and link syntax; collapses blank runs.
- No caching and no launch-time check: nothing is fetched until the user taps Check
  (unauthenticated GitHub API: 60 requests/hour/IP).

## Settings UI (`src/update-ui.js`)
`createUpdateUI(doc, { installedVersion, checker, installer, openExternal }).render(container)`:
- Builds `.settings-body` › "App" `.list-label` + `.list-group` with a row "Updates / Version x.y.z"
  and a `Check` button, plus a hidden `role=status aria-live=polite` result row
  (`[data-update-status]`). Unhides the container (`#app-update` ships `hidden` in `index.html`).
  Idempotent (AbortController); all text via `textContent`.
- Check: button disabled + "Checking…"; result "You're on the latest version (x.y.z).", "Couldn't
  check for updates. Check your connection and try again." (logs `[update-ui]`), or
  "Version x.y.z is available." + `.app-update__notes` (if any) + `Install version x.y.z`.
- Install: button disabled + "Downloading…" → `installer.downloadAndInstall(apkUrl)`.
  `InstallPermissionError` → its message in `[data-install-message]`; any other error → logs,
  "Couldn't download here — opening your browser instead." and `openExternal(apkUrl)`.

## Native install (`ApkUpdaterPlugin.java`, `apk-installer.js`)
- Registered in `MainActivity.onCreate` before `super.onCreate`. Manifest adds
  `REQUEST_INSTALL_PACKAGES`.
- Accepts only `https://github.com/...` URLs (redirects to GitHub's download host are followed).
- If `canRequestPackageInstalls()` is false: opens `ACTION_MANAGE_UNKNOWN_APP_SOURCES` for the app and
  rejects `INSTALL_PERMISSION` ("Allow installs from Step Tracker, then tap Install again.") — the JS
  side maps it to `InstallPermissionError`.
- Else downloads on a background thread to `cacheDir/updates/step-tracker-update.apk`, shares it via
  the existing `${applicationId}.fileprovider` (`cache-path "."`), and starts `ACTION_VIEW` with the
  APK MIME type. Android asks the user to confirm; an update needs the same signing key.

## Wiring (`src/main.js`)
Only when `isNative`: `createUpdateUI(doc, { installedVersion: APP_VERSION, checker:
createUpdateChecker({ installedVersion: APP_VERSION }), installer: createApkInstaller(), openExternal:
url => AppLauncher.openUrl({ url }) })`, rendered into `#app-update`; setup failures are logged and
boot continues.

## Tests
`src/app-update.test.js`, `src/update-ui.test.js`, `src/platform/native/apk-installer.test.js`,
`src/main.test.js` (native wiring / web absence), `src/index.test.js` (`#app-update` mount), and
`scripts/release-management.test.js` (plugin, manifest, Gradle version, workflow invariants).
