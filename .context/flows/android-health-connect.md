# Flow: Android App — Health Connect Connection & Sync

<!-- context-meta
verification-commit: ST-017–ST-019 working tree (feature/ST-017-019-android-health-connect)
generated-at: 2026-09-28T13:00:00Z
confidence: high (unit-tested; verified on a Pixel 9 emulator, Android 17, real Health Connect)
-->

## Overview
Inside the Capacitor Android app, steps and distance come from **Health Connect** instead of the
Google Fit REST API. The same web code runs in the app's WebView; `src/platform/*` decides per
platform. The Connect button (Settings › Connections, and the first-launch welcome screen) reads **Connect Health Connect**, requests Health Connect read access
(steps, distance and history), and every sync reads hourly aggregates through
`@capgo/capacitor-health`. No Google sign-in is involved in syncing steps (Drive backup in the app
arrives with ST-020).

## Entry Points
- **Type**: UI event + automatic at launch
- **Path**: `#auth-btn` / `#onboarding-connect` click → `connection.connect()`; bootstrap → `connection.restore()`;
  `connection.onConnected(...)` dismisses the welcome screen and auto-syncs after either succeeds; `#sync-btn` or pull-to-refresh → `syncTrigger.run()`;
  app resume (`src/platform/app-lifecycle.js`, Capacitor `resume`) → `syncTrigger.runIfStale()` (ST-021: only when
  connected and ≥ 10 min since the last sync started — `src/sync-trigger.js`)
- **Files**: `src/main.js` (wiring), `src/platform/capabilities.js`, `src/platform/step-source.js`,
  `src/platform/native/health-connect-connection.js`, `src/health-connect-step-source.js`,
  `src/steps.js` (engine), `android/app/src/main/AndroidManifest.xml`

## Core Path
1. `bootstrap()` resolves `isNative = isNativePlatform()` (Capacitor), then:
   - `selectStorageManager` → always-persisted storage (app storage is never evicted);
   - `createFileSaver` → exports to `Documents/Step Tracker/`;
   - `createStatusReporter(doc, { connectLabel: 'Connect Health Connect' })`;
   - `selectStepSource` → `{ source: createHealthConnectStepSource(Health, reporter),
     connection: createHealthConnectConnection({ health: Health, reporter, launcher: AppLauncher }) }`;
   - no service worker (`prod && !isNative`).
2. **Connect** (`connection.connect()`): `Health.isAvailable()`; if unavailable → status
   `⚠️ Install or update Health Connect, then tap Connect again` and open Health Connect's Play
   Store page. Otherwise `Health.requestAuthorization({ read: ['steps','distance'],
   requestHistoryAccess: true })` — Health Connect shows its permission sheet (Steps + Distance),
   then the "access past data" prompt. Steps granted → `✅ Connected` (button → Reconnect) and
   sync; refused → `🔑 Step access not allowed — allow it in Health Connect`.
3. **Restore at launch** (`connection.restore()`): if available and steps are already authorized
   (`checkAuthorization`) → `✅ Connected` + sync; otherwise silent.
4. **Sync** (`steps.js` engine, unchanged windows/latch/upsert): `source.isReady()` is async
   (availability + steps authorized). Per ≤30-day chunk, `fetchDays` runs two
   `Health.queryAggregated({ bucket: 'hour', aggregation: 'sum' })` calls (steps, distance) over the
   chunk's exact local-midnight instants, groups buckets by **local calendar date** (DST-safe),
   rounds hourly steps, and zero-fills every date in the chunk. Distance is best-effort.
5. Records flow through `_toDailyRecords` → `_upsertChunk` exactly as for Fit (overrides kept,
   high-water mark, `hourly_steps` refreshed).

## Error Surface
- Steps read rejected with code `permission-denied` → `FAILURE_AUTH_EXPIRED` →
  `🔑 Health Connect access was removed — tap "Connect Health Connect" to allow it again, then sync again to continue…`
- Any other steps read failure → `FAILURE_SOURCE_ERROR` → `❌ Sync stopped at chunk i/n — Health Connect data could not be read.`
- Distance read failure → logged `[health-connect] distance read failed`; day's distance estimated.
- Not ready → `🔑 Tap "Connect Health Connect" to allow step access first`.

## Google Drive in the app (ST-020, ST-026)
- `selectAuth` (`src/platform/auth.js`) → `createNativeGoogleAuth`, scope `drive.appdata` only, never
  writes the header status. **First connect**: Credential Manager sign-in via the lazily loaded
  `@capgo/capacitor-social-login` (account picker + consent); the account's email is remembered in
  localStorage `google_drive_account` (never a token).
- **Every token after that** (ST-026) comes from the app-local `DriveAuthorization` plugin
  (`android/.../DriveAuthorizationPlugin.java`, registered in `MainActivity.onCreate`; JS side
  `src/platform/native/drive-authorization.js`): Play services' Authorization API
  (`Identity.getAuthorizationClient().authorize`, `setAccount(email)`) returns a token for the granted
  scope with **no UI** and renews it when expired. A needed resolution is reported as `NEEDS_CONSENT`
  (→ null, silent) — never launched. The silent restore at launch and `getFreshAccessToken()` (called
  by `drive-sync.js` before every request via `main.js`) use it, so a relaunch never shows
  Credential Manager's "Signing in as…" sheet and an in-memory app never uploads with an expired
  token. The SocialLogin plugin's `refresh()` is no longer used.
- Drive panel → **Connect Google Drive** (`src/platform/native/google-drive-connection.js`, flag
  `google_drive_connected`, silent restore at launch; `onConnected` re-renders the panel via
  `data:drive-sync:refresh`).
- **Make this the primary device** → `primary_device` settings row + immediate upload; only the
  primary auto-uploads (see `.context/flows/backup-and-cloud-sync.md`).
- `MainActivity` implements `ModifiedMainActivityForSocialLoginPlugin` and forwards Google's consent
  result (required for scoped sign-in).

## Behaviour Notes
- Health Connect aggregates honour the user's **data-source priority list** (de-duplication across
  phone/watch/apps); the app shows the same totals as the Health Connect app. A source not on the
  list is excluded.
- Without history access Health Connect only returns ~30 days before the grant; zero-filled days
  beyond that are stored as 0. Restore a Fit-era backup file (Settings › Backup & restore) to keep older history —
  restore overwrites the same days.
- The pre-sync empty-DB Drive recovery runs with `pull({ silent: true })`, so no Google token (the
  normal state in the app until ST-020) never overwrites the connection status.

## Integrations
- `@capgo/capacitor-health` 8.x → Android Health Connect (`androidx.health.connect:connect-client`)
- `@capacitor/app-launcher` → Play Store link; `@capacitor/filesystem` → exports
- `@capacitor/app` → `resume` (ST-021) and `backButton` (ST-025: `onBackButton` hands it to the navigator; at the root the app exits)
- `@capacitor/share` → the Group challenge update's "Share to group" (Android share sheet, ST-025)

## Tests
- `src/health-connect-step-source.test.js` (contract, readiness, hourly→daily grouping, zero-fill,
  distance fallback, error classification, DST day attribution — passes in several timezones)
- `src/platform/native/health-connect-connection.test.js`, `src/platform/step-source.test.js`,
  `src/platform/*.test.js`, `scripts/android-manifest.test.js`, `main.test.js` (Android wiring suite)
- Device verification steps: `docs/plans/android-release.md` → *Testing on an emulator*.
