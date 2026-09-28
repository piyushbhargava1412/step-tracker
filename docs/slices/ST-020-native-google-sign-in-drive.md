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
