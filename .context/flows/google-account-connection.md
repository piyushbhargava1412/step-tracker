# Flow: Google Account Connection (OAuth Token Acquisition)

<!-- context-meta
verification-commit: 87a2be210c32952fad49351243445601b3564a97
generated-at: 2026-08-08T11:16:42.345+05:30
confidence: high
-->

## Overview
Authenticates the user in-browser with Google Identity Services and obtains a Fitness read-scoped OAuth access token so step data can later be fetched.

## Entry Points
- **Type**: UI Event (browser)
- **Path/Topic**: `#auth_btn` click → `requestToken()`
- **File**: `index.html` (button), `app.js` (handler)

## Core Path
1. `window.onload -> google.accounts.oauth2.initTokenClient()` initializes `tokenClient` with `CLIENT_ID` and scope `fitness.activity.read` (`app.js`).
2. `#auth_btn click -> requestToken() -> tokenClient.requestAccessToken()` triggers the Google consent/token popup (`app.js`).
3. `tokenClient.callback(tokenResponse)` stores `accessToken`, sets `#auth_btn` text to "Connected!", and reveals `#fetch_btn` (`app.js`).

## Data Touchpoints
- **Entities**: In-memory `accessToken`, `tokenClient` (module-level variables in `app.js`)
- **Tables**: None (no persistence; token held only in browser memory)

## Integrations
- **Type**: API Call (client-side OAuth)
- **Target**: Google Identity Services
- **Channel**: `https://accounts.google.com/gsi/client` (`initTokenClient`, `requestAccessToken`)

## Scope
- `app.js` (top section: `CLIENT_ID` guard, `window.onload`, `requestToken`)
- `index.html` (GSI script include, `#auth_btn`, `#fetch_btn`)
- `config.example.js` / `config.local.js` (`window.APP_CONFIG.CLIENT_ID`)

## Tests
- None found in repository.

## Notes
- The scope is limited to `fitness.activity.read`. The PRD (`.arcus/plans/PRD.md`) envisions an additional `drive.appdata` scope for cloud backup, but that is not implemented in current code.
