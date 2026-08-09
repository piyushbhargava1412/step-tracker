# Flow: Google Account Connection (OAuth Token Acquisition)

<!-- context-meta
verification-commit: 87a2be210c32952fad49351243445601b3564a97
generated-at: 2026-08-08T11:16:42.345+05:30
confidence: high
-->

## Overview
Authenticates the user in-browser with Google Identity Services and obtains an OAuth access token with Fitness read scopes (both step activity and location data) so step data can later be fetched.

## Entry Points
- **Type**: UI Event (browser)
- **Path/Topic**: `#auth_btn` click → `requestToken()`
- **File**: `index.html` (button), `app.js` (handler), `src/auth.js` (implementation)

## Core Path
1. **Initialization**: On app start, `src/auth.js` calls `google.accounts.oauth2.initTokenClient()` with:
   - Client ID from `import.meta.env.VITE_CLIENT_ID` (loaded from `.env.local`)
   - Scopes: `fitness.activity.read fitness.location.read` (space-delimited for both step activity and location)

2. **Token Request**: User clicks `#auth_btn` → calls `requestToken()` → `tokenClient.requestAccessToken()` triggers the Google consent/token popup.

3. **Token Storage**: `tokenClient.callback(tokenResponse)` receives the access token and stores it in module closure within `src/auth.js` (not on window object).

4. **UI Feedback**: Sets `#auth_btn` text to "Connected!" and reveals `#fetch_btn`.

## Data Touchpoints
- **Entities**: 
  - In-memory `accessToken` (module-level in `src/auth.js`, stored in closure, never exposed globally)
  - `tokenClient` (module-level in `src/auth.js`)
- **Tables**: None (no persistence; token held only in browser memory during session)

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
fitness.activity.read fitness.location.read
```
- `fitness.activity.read`: Read step count and activity data
- `fitness.location.read`: Read location-based fitness data

## Scope
- `src/auth.js` (OAuth 2.0 initialization, token client setup, token storage)
- `src/config.js` (validates `import.meta.env.VITE_CLIENT_ID`)
- `index.html` (Google Identity Services script include, `#auth_btn`, `#fetch_btn`)
- `app.js` (button click handlers)

## Tests
- None found in repository.

## Notes
- Token is stored in module closure (`src/auth.js`), not on the window object or any global variable
- Configuration has been migrated from `config.example.js` / `config.local.js` with `window.APP_CONFIG.CLIENT_ID` to `.env.local` + `import.meta.env.VITE_CLIENT_ID`
- Both fitness scopes are required for full functionality: activity read provides step counts, location read provides location-based insights
