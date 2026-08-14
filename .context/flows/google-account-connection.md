# Flow: Google Account Connection (OAuth Token Acquisition)

<!-- context-meta
verification-commit: 7e440b755ebfd852ef1e22508b0aa5bb0fe55c4a
generated-at: 2026-08-14T00:00:00Z
confidence: high
-->

## Overview
Authenticates the user in-browser with Google Identity Services and obtains an OAuth access token with Fitness read scopes (both step activity and location data) so step data can later be fetched. The connection is restored automatically after a page refresh (silent GSI token request), and a sync kicks off automatically the moment a valid token arrives — no second click needed.

## Entry Points
- **Type**: UI Event (browser) + automatic on bootstrap
- **Path/Topic**: `#auth-btn` click → `auth.requestToken()`; on boot with a persisted connection flag → `auth.requestToken({ prompt: '' })` (silent restore)
- **File**: `index.html` (button), `src/main.js` (event binding + auto-sync hook), `src/auth.js` (implementation)

## Core Path
1. **Initialization**: On app start, `src/auth.js` calls `google.accounts.oauth2.initTokenClient()` with:
   - Client ID from `import.meta.env.VITE_CLIENT_ID` (loaded from `.env.local`)
   - Scopes: `fitness.activity.read fitness.location.read drive.appdata` (space-delimited; ST-012 added `drive.appdata` so the same token also authorizes Google Drive AppData cloud backup — see `.context/flows/backup-and-cloud-sync.md`)

2. **Token Request**: User clicks `#auth_btn` → calls `requestToken()` → `tokenClient.requestAccessToken()` triggers the Google consent/token popup.

3. **Token Storage**: `tokenClient.callback(tokenResponse)` receives the access token and stores it in module closure within `src/auth.js` (not on window object).

4. **UI Feedback**: Sets `#auth_btn` text to "Connected!" and reveals `#fetch_btn`.

5. **Auto-sync on connect** (`main.js`): `createAuth(...).onTokenReceived(...)` registers a hook fired on every valid token. The hook persists a boolean `google_connected` flag to localStorage (never the token) and runs the shared post-sync re-render pipeline — so the first connect and any later silent restore both sync immediately, without clicking Sync Steps.

6. **Silent session restore on refresh** (`main.js`): if `google_connected === '1'`, bootstrap calls `auth.requestToken({ prompt: '' })`. GSI re-issues a fresh token without UI when Google's session cookie is still valid, re-running step 5. If the session expired, the callback carries an error, the token stays `null`, and the user clicks Connect again.

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

### OAuth Scopes (Space-Delimited)
```
fitness.activity.read fitness.location.read drive.appdata
```
- `fitness.activity.read`: Read step count and activity data
- `fitness.location.read`: Read location-based fitness data
- `drive.appdata`: Read/write the app-private Google Drive AppData folder (ST-012 cloud backup; see `.context/flows/backup-and-cloud-sync.md`)

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
- Both fitness scopes are required for full functionality: activity read provides step counts, location read provides location-based insights
- `drive.appdata` is requested in the same consent screen as the fitness scopes (single sign-in); a token missing this scope would only affect Drive cloud sync (`.context/flows/backup-and-cloud-sync.md`), not step sync — the two capabilities share one `auth.js` token but are otherwise independent
