Story ID: ST-026

# ST-026 — Stay Connected to Google Drive, and Honest Storage Wording in the App

## Context

Phase 3 follow-up of [health-connect-android-roadmap.md](../plans/health-connect-android-roadmap.md), from the owner's first days with the v0.2.0 release build (2026-09-29):

1. **"It signs in to Google again during the automatic sync."** A Google access token lasts one hour. ST-020's silent reconnect calls the SocialLogin plugin's `refresh()`, which — once the token has expired — runs a new **Credential Manager sign-in** with auto-select. That shows the "Signing in as …" sheet whenever the app starts cold (Android closed it in the background) more than an hour after the last token. Other apps stay signed in because they ask Google Play services for *authorization* (an access token for an already-granted scope), which needs no sign-in and no UI.
2. **Stale token → silent backup failures.** The token is fetched once at launch and cached. If the app stays in memory for more than an hour, the automatic Drive backup after each sync uses an expired token and fails (logged only).
3. **Browser wording in the app.** Settings › Backup & restore shows "Local Browser Storage: 🟢 Protected" and a "Request Browser Storage Protection" button. Browser storage eviction doesn't apply to the app (its database lives in app-private storage, removed only by uninstalling or clearing the app's data), so the row is misleading and the button does nothing useful.

## Scope

* **Native Drive authorization** — a small app-local Capacitor plugin (`DriveAuthorization`, Java, in the Android project) calling Google Play services' Authorization API (`Identity.getAuthorizationClient().authorize(...)`) for `drive.appdata`, for the account the user connected. It never shows UI: when Google needs the user again (access removed, account gone) it reports `NEEDS_CONSENT` and the app shows "Connect Google Drive" again.
* **Silent reconnect and every token refresh use that plugin**, not Credential Manager sign-in. The first **Connect Google Drive** still uses the SocialLogin sign-in (account picker + consent, verified in ST-020) and remembers the account's email (`google_drive_account` in localStorage — an email, never a token).
* **Fresh token for every Drive call** — the Drive gateway asks the auth for a token right before each request (`getFreshAccessToken()`, native only; Play services returns its cached token while valid and renews it when expired). Web is unchanged.
* **Storage panel in the app** — the local row reads "On this phone: 🟢 Kept until the app is uninstalled" and the browser-protection button and hint are not rendered. The browser keeps its current panel.

## Out of Scope

* Web (Google Identity Services) token refresh — the web build becomes a read-only viewer in ST-023.
* A "Disconnect Google Drive" action.

## Acceptance Criteria

* Relaunching the app hours after connecting shows **no** Google sheet, and Drive backup/restore works.
* With the app kept in memory for more than an hour, the next automatic backup succeeds.
* A silent authorization that needs the user leaves Drive disconnected with no popup and no error message.
* In the app, the storage panel has no browser wording and no protection button; the browser panel is unchanged.
* Tests for the plugin adapter, the native auth, the async token in `drive-sync.js`, the storage panel on both platforms, and a source guard for the Java plugin's registration.

## Implementation

* New `android/app/src/main/java/com/piyushbhargava/steptracker/DriveAuthorizationPlugin.java`, registered in `MainActivity`; `play-services-auth` in `android/app/build.gradle`.
* New `src/platform/native/drive-authorization.js` (JS adapter); [google-auth.js](../../src/platform/native/google-auth.js) silent path; [drive-sync.js](../../src/drive-sync.js) awaits the token; [main.js](../../src/main.js) wiring; [storage-health-ui.js](../../src/storage-health-ui.js) app wording.

## As built

* `DriveAuthorizationPlugin.authorize({ scopes, account? })` → `{ accessToken }`; rejects `NEEDS_CONSENT` (resolution needed — never launched), `NO_TOKEN`, `AUTHORIZATION_FAILED`, `INVALID_ARGUMENT`. `play-services-auth:21.4.0` (the SocialLogin plugin's version) added to the app module.
* `createDriveAuthorization(plugin?)` registers the plugin on first use and resolves to the token or `null` (quiet for `NEEDS_CONSENT`, logged otherwise).
* `createNativeGoogleAuth`: silent = Play services only; interactive = Play services first, then SocialLogin `login()` (remembers `profile.email`); `getFreshAccessToken()` returns `null` until the user has connected, else a renewed token (falling back to the last one); `signOut()` forgets the account.
* Installs connected before ST-026 have no remembered account: the first silent authorization runs without one (Play services picks the granted account); if Google needs a choice, Drive shows **Connect Google Drive** once and the account is remembered from then on.
* `drive-sync.js` awaits `getAccessToken()`; `main.js` passes `auth.getFreshAccessToken` in the app and `auth.getAccessToken` on the web.
* Verified: unit + source-guard tests, release APK compiles with the plugin packaged. **On-device check pending (owner):** relaunch after > 1 hour shows no Google sheet; auto-backup after > 1 hour in memory succeeds.
