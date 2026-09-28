Story ID: ST-020

# ST-020 — Native Google Sign-In for Drive & Primary Device

## Context

Phase 3 of [health-connect-android-roadmap.md](../plans/health-connect-android-roadmap.md). Google blocks its web sign-in inside embedded WebViews, so Drive backup/restore fails in the APK. After ST-019 the app no longer needs Fit scopes — only `drive.appdata`. Drive sync is whole-file last-writer-wins, so once the app pushes, the PWA must stop overwriting it.

## Scope

* Native Google sign-in plugin supporting extra scopes (reuse `tuition-manager`'s choice, `@capgo/capacitor-social-login`, unless the spike shows a blocker). Native implementation of `src/platform/auth.js`.
* Android OAuth client in the **same Google Cloud project** as the web client (so `appDataFolder` is shared), with debug and release SHA-1s.
* On native, request only `drive.appdata`; on web keep today's scopes.
* **Primary device:** a per-install device ID; "Make this the primary device" (native only) writes `primaryDevice` into the backup envelope. A non-primary installation stops auto-pushing after sync and asks before a manual push.

## Out of Scope

* iOS. Removing web sign-in.

## Acceptance Criteria

* In the APK: sign in, back up, and restore the **same** snapshot the PWA pushed.
* Relaunch reconnects silently without a consent prompt.
* After making the app primary, the PWA's post-sync auto-push is skipped (tested with Drive mocked).
* Release-signed build signs in (release SHA-1 registered).

## Implementation

* `src/platform/native/auth.js`, [drive-sync.js](../../src/drive-sync.js), [backup-format.js](../../src/backup-format.js), [steps.js](../../src/steps.js) post-sync hook consults the primary-device check via an injected collaborator.

## As built

* **Plugin:** `@capgo/capacitor-social-login` 8.5.11, loaded **lazily and only in the app** (`src/platform/auth.js` → `selectAuth`): its web module runs OAuth-redirect handling on import, which the PWA must not do.
* `src/platform/native/google-auth.js` — `createNativeGoogleAuth` with the web `createAuth` contract; requests only `drive.appdata`; silent requests (`prompt: ''`) use `refresh` + `getAuthorizationCode` and never show UI; never writes the header status (Health Connect's). `MainActivity` implements `ModifiedMainActivityForSocialLoginPlugin` (required for scoped sign-in — found on device).
* **Drive connection in the app** (`src/platform/native/google-drive-connection.js`, on the shared `src/platform/google-connection.js`): a **Connect Google Drive** button in the Drive panel, flag `google_drive_connected`, silent restore at launch. The web header connection now uses the same shared module.
* **Primary device** (`src/primary-device.js`): random per-install id in localStorage (`device_id`); primary stored as the `primary_device` settings row (travels in every backup) and mirrored by `drive-sync.push` into the Drive file's `appProperties`. `drive-sync.readPrimaryDevice()` reads it with a metadata-only request. `otherPrimary()` asks Drive first and **fails closed** (no answer → blocked); the post-sync auto-upload in `steps.js` is skipped when another device is primary. The Drive panel shows the primary, offers **Make this the primary device** (app only; uploads at once) and asks before a manual upload replaces a *known* other primary.
* The native build strips Google's web sign-in script from `index.html`.
* Extra install-time permissions from Credential Manager libraries: `USE_CREDENTIALS`, `USE_BIOMETRIC`, `USE_FINGERPRINT` (no prompt; same as tuition-manager).
* **Verified on the Pixel 9 emulator with the owner's account, Drive kept read-only** (auto-backup off + a DevTools guard blocking every non-read Drive request): debug build signs in (account picker → sign-in consent; no separate Drive consent since the project already had it from the PWA); **Restore from Drive** loaded the PWA's real backup (3,193 days) — the app and PWA share `appDataFolder`; relaunch reconnected silently (`refresh`/`getAuthorizationCode` only); a **release-signed** APK (release SHA-1) signed in. The Drive file's `modifiedTime` stayed at the PWA's last upload.
* **Not exercised on a device:** *Make this the primary device* and uploads from the app (they would overwrite the real backup) — covered by unit tests; to be done at the real cutover.
