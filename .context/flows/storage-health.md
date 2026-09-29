# Flow: Status Lights, Backup Pill & Storage Panel

> ST-013 (2026-08-15) introduced a storage-protection badge and silent `navigator.storage.persist()`
> gestures. ST-027 (2026-09-29) retired both: app storage is never evicted, and the web viewer's copy
> can be re-downloaded from Drive (ST-023). What remains is below.

<!-- context-meta
verification-commit: HEAD (ST-027)
generated-at: 2026-09-29T00:00:00Z
confidence: high
-->

## Overview
Today's status line has at most two pills, each a coloured **status light** (a glowing dot:
green `ok`, amber `warn`, red `error`) and a short label; the full message is the pill's tooltip and
accessible name (`src/status-light.js`).
- **Connection** (`#auth-status`) — Health Connect access in the app, Google sign-in in the web
  viewer: green **Connected** or amber/red **Disconnected**. Tap → Settings.
- **Backup** (`#backup-status`, Android app only) — hidden while the phone's Google Drive backup is
  fine; amber **Not backed up** when it needs attention. Tap → Backup & restore.
Data messages (`reporter.db(text)` — load errors, "Backup saved to …") are short toasts, never pills.
The Backup & restore screen keeps its **Storage protection** panel.

## Entry Points
- **Type**: automatic — `reporter.auth(text)` from the connection (`src/platform/native/health-connect-connection.js`,
  `src/auth.js`); `backupStatus.refresh()` at launch, after every sync, and on the
  `data:drive-sync:refresh` / `data:storage-health:refresh` events (Drive panel connect, toggle,
  upload, make primary, post-sync upload).
- **Type**: UI Event — `#backup-status` click → `screens.go('backup')`; `#auth-status` click → Settings.
- **File**: `src/status-light.js`, `src/ui-status.js`, `src/backup-status.js`, `src/storage-health-ui.js`,
  `src/main.js`, `index.html`, `styles.css`

## Core Path
1. `levelOf(text)` maps a message's leading symbol to a light: ✅ → `ok`; ⚠️ ℹ️ → `warn`; 🔑 ❌ and
   anything unrecognised → `error`. `stripSymbol` keeps the words.
2. `reporter.auth(text)` → `renderStatusPill(doc, #auth-status, { level, label: 'Connected' |
   'Disconnected', detail })` (light span + `.status-pill__label`, `title`, `aria-label`,
   `data-level`), and still sets the auth button to "Reconnect" / the connect label. `index.html`
   starts the pill as a red **Disconnected** ("Not connected").
3. `createBackupStatus({ doc, settings, primaryDevice, isDriveConnected, onOpen })` → `refresh()`
   reads `getDriveBackupEnabled()` (fail-open true), `getLastDriveSync()` (fail-open null) and
   `primaryDevice.status()`, then `computeBackupStatus(...)`:
   - another device is the primary → fine (it does the backing up);
   - Drive not connected → "Google Drive is not connected";
   - automatic backup off → "Automatic backup is off";
   - never backed up → "This phone has not backed up to Google Drive yet";
   - last backup older than `STALE_BACKUP_MS` (3 days) → "Last backup to Google Drive was N days ago";
   - otherwise fine → the pill is `hidden`.
   `main.js` counts Drive as connected when `driveConnection.isConnected()` **or** the
   `google_drive_connected` flag is set, so the silent reconnect at launch never flashes a warning.
4. `reporter.db(text)` → `showToast(doc, text)` (`src/toast.js`); `initDB` no longer announces
   "DB ready".
5. **Storage protection panel** (`src/storage-health-ui.js`, `createStorageHealthUI(doc, settings,
   nav, { appStorage })`) on Backup & restore: a "Google Drive Cloud Backup:" row (`🟢 Active
   ([size])` / `🟢 Active` / `⚪ Disabled`) and, in the app, "On this phone: 🟢 Kept until the app is
   uninstalled" (ST-026). In a browser it shows "Local Browser Storage" (`🟢 Protected` /
   `🟡 Unpersisted`) and a "Request Browser Storage Protection" button that calls
   `nav.storage.persist()` and hints on a decline/error — reachable only for editors, so in practice
   not shown since the web became a viewer. It re-renders on `data:storage-health:refresh`.

## Data Touchpoints
- `settings`: `drive_backup_enabled`, `last_drive_sync` (`{ at, bytes }`), `primary_device`.
- localStorage `google_drive_connected` (the app's Drive connection flag).

## Scope
- `src/status-light.js` — `levelOf`, `stripSymbol`, `renderStatusPill`, `STATUS_OK/WARN/ERROR`
- `src/ui-status.js` — `auth` renders the light; `db` toasts
- `src/backup-status.js` — `computeBackupStatus`, `createBackupStatus`, `STALE_BACKUP_MS`
- `src/storage-health-ui.js` — the Storage protection panel
- `src/drive-sync-ui.js` — dispatches `data:storage-health:refresh` / `data:drive-sync:refresh`
- `src/main.js` — wiring (app-only backup pill, refresh triggers)
- `index.html` (`#auth-status`, `#backup-status`), `styles.css` (`.status-pill`, `.status-light*`)

## Tests
- `src/status-light.test.js`, `src/backup-status.test.js`, `src/ui-status.test.js`,
  `src/storage-health-ui.test.js`, `src/main.test.js` ("ST-027 backup pill"), `src/index.test.js`,
  `src/styles.test.js`.

## Removed in ST-027
- `src/storage.js` (`requestPersistentStorage`, `PERSISTED_TEXT`), `src/storage-health.js`
  (`computeBadgeText`, `isProtected`, `refreshStorageProtectionBadge`,
  `requestSilentPersistAndRefreshBadge`, `CLOUD_SYNCED_TEXT`, `BACKUP_DISABLED_TEXT`), the
  `#db-status` pill and its click handler, and the silent persist requests on Connect, Sync and the
  auto-backup toggle.
