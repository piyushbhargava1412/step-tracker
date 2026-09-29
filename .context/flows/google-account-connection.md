# Flow: Google Account Connection (OAuth Token Acquisition)

<!-- context-meta
verification-commit: 7e440b755ebfd852ef1e22508b0aa5bb0fe55c4a
generated-at: 2026-08-14T00:00:00Z
confidence: high
-->

## Overview
Authenticates the user in-browser with Google Identity Services and obtains an OAuth access token for **Drive app data only** (ST-024 removed the Google Fit scopes), which the read-only web viewer uses to download the Android app's backup (`.context/flows/read-only-web-viewer.md`). The connection is restored automatically after a page refresh (silent GSI token request), and a snapshot refresh kicks off automatically the moment a valid token arrives — no second click needed.

> **Platform note (ST-019):** this flow is the **browser** connection. The logic lives in
> `src/platform/web/google-account-connection.js` (`createGoogleAccountConnection` — `connect()`,
> `restore()`, `onConnected()`), selected by `src/platform/step-source.js`. In the Android app the
> same header button connects **Health Connect** instead — see
> `.context/flows/android-health-connect.md`.

## Entry Points
- **Type**: UI Event (browser) + automatic on bootstrap
- **Path/Topic**: `#auth-btn` click → `auth.requestToken()`; on boot with a persisted connection flag → `auth.requestToken({ prompt: '' })` (silent restore)
- **File**: `index.html` (button), `src/main.js` (binds `#auth-btn` → `connection.connect()`, `connection.onConnected(runSync)`, `connection.restore()`), `src/platform/web/google-fit-connection.js` (flag + token wiring), `src/auth.js` (implementation)

## Core Path
1. **Initialization**: On app start, `src/auth.js` calls `google.accounts.oauth2.initTokenClient()` with:
   - Client ID from `import.meta.env.VITE_CLIENT_ID` (loaded from `.env.local`)
   - Scope: `https://www.googleapis.com/auth/drive.appdata` only (ST-024; the Fit scopes were removed with the Fit source — see `.context/flows/backup-and-cloud-sync.md`)

2. **Token Request**: User clicks `#auth_btn` → calls `requestToken()` → `tokenClient.requestAccessToken()` triggers the Google consent/token popup.

3. **Token Storage**: `tokenClient.callback(tokenResponse)` receives the access token and stores it in module closure within `src/auth.js` (not on window object).

4. **UI Feedback**: Sets `#auth_btn` text to "Connected!" and reveals `#fetch_btn`.

5. **Auto-sync on connect** (`google-fit-connection.js`, wired by `main.js`): `createAuth(...).onTokenReceived(...)` registers a hook fired on every valid token. The hook persists a boolean `google_connected` flag to localStorage (never the token) and runs the shared post-sync re-render pipeline — so the first connect and any later silent restore both sync immediately, without clicking Sync Steps.

6. **Silent session restore on refresh** (`connection.restore()`): if `google_connected === '1'`, bootstrap calls `auth.requestToken({ prompt: '' })`. GSI re-issues a fresh token without UI when Google's session cookie is still valid, re-running step 5. If the session expired, the callback carries an error, the token stays `null`, and the user clicks Connect again.

## Data Touchpoints
- **Entities**: 
  - In-memory `accessToken` (module-level in `src/auth.js`, stored in closure, never exposed globally)
  - `tokenClient` (module-level in `src/auth.js`)
- **Tables**: None (token held only in browser memory during session)
- **Other**: `localStorage['google_connected']` — a boolean "user connected before" flag used to decide whether to attempt a silent restore; the access token itself is never persisted.

## Integrations
- **Type**: API Call (client-side OAuth)
- **Target**: Google Identity Services
- **Channel**: `https://accounts.google.com/gsi/client` (`initTokenClient`, `requestAccessToken`)

## Configuration

### Environment Variables
- **`VITE_CLIENT_ID`**: OAuth 2.0 Client ID (loaded from `.env.local`)
  - Path: `import.meta.env.VITE_CLIENT_ID` in source code
  - Must be set before build/dev server starts
  - Example value: `123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com`

### OAuth Scope
```
https://www.googleapis.com/auth/drive.appdata
```
- `drive.appdata`: the app-private Google Drive AppData folder — the browser only reads it (ST-023 viewer); the Android app backs up to it. The Google Cloud consent screen should list only this scope (owner step, ST-024).

## Scope
- `src/auth.js` (OAuth 2.0 initialization, token client setup, token storage, `onTokenReceived` listener, `requestToken(options)` for silent restore)
- `src/config.js` (validates `import.meta.env.VITE_CLIENT_ID`)
- `src/main.js` (event binding — `#auth-btn` click → `auth.requestToken()`; auto-sync hook + silent-restore wiring via injected `storage` collaborator)
- `index.html` (Google Identity Services script include, `#auth-btn`)

## Tests
- `src/auth.test.js` — unit tests for `createAuth` factory (init, token callback, `getAccessToken`, `onTokenReceived`, `requestToken({ prompt: '' })`)
- `src/main.test.js` — auto-sync-on-connect hook, silent-restore gating on the persisted flag, and flag-persistence tests

## Notes
- Token is stored in module closure (`src/auth.js`), not on the window object or any global variable
- The implicit GSI token flow has **no refresh token**; silent restore works only while Google's `gsi_session` cookie is valid (a refresh keeps it; a full browser restart or a long gap may expire it, at which point the user reconnects once)
- Configuration has been migrated from `config.example.js` / `config.local.js` with `window.APP_CONFIG.CLIENT_ID` to `.env.local` + `import.meta.env.VITE_CLIENT_ID`
- The browser has no step source (ST-024); without a token the viewer shows its "Connect your Google Account" message and keeps its cached snapshot.
