# Flow: Local Backup/Restore & Google Drive Cloud Sync

> Added: ST-012 — 2026-08-14

<!-- context-meta
verification-commit: 74fa46903f2fe0d51e91869ea7a846be7edfadcf
generated-at: 2026-08-14T13:00:00Z
confidence: medium
-->

## Overview
A dedicated "💾 Backup" tab (`#tab-backup`) lets the user export/import a full local JSON backup of
the Dexie database (`src/backup.js` engine + `src/backup-ui.js` renderer), and separately back up to
/ restore from the user's own Google Drive `appDataFolder` (`src/drive-sync.js` gateway +
`src/drive-sync-ui.js` renderer). The panel renders as a responsive 2-column grid (`.backup-grid`) —
"📄 Local JSON Files" on the left, "☁️ Google Drive Cloud Sync" on the right, stacking to one column
below 1024px — with each column's destructive restore action paired with an amber
"⚠️ Overwrites local database" guardrail badge. A background hook in the step-sync engine also fires
an automatic, silent post-sync push to Drive (opt-out via a persisted toggle). Google Drive access
requires the `drive.appdata` OAuth scope, added to the token request in `src/auth.js`.

## Entry Points
- **Type**: UI Event (browser) — manual local backup
  - `#tab-backup` → `[data-action="export-backup"]` click → download a JSON backup file → records the export timestamp via `settings.setLastLocalExport`
  - `#tab-backup` → `[data-action="import-backup"]`-style file input change → confirm via `confirmFn` → restore from a chosen JSON file (`src/backup-ui.js`)
- **Type**: UI Event (browser) — manual cloud sync
  - `#tab-backup` → `[data-action="backup-to-drive"]` click → `driveSync.push(backup.buildBackup())` → records `{ at, bytes }` via `driveBackupPrefs.setLastDriveSync`
  - `#tab-backup` → `[data-action="restore-from-drive"]` click → confirm → `driveSync.pull()` → `backup.restoreBackup()`
  - `#tab-backup` → `[data-action="toggle-drive-backup"]` change → `settings.setDriveBackupEnabled(checked)`
- **Type**: App lifecycle (browser) — automatic background push
  - After every `stepSync.sync()` completes successfully, `src/steps.js` fires a fire-and-forget push to Drive (see Core Path below)
- **File**: `src/backup.js`, `src/backup-ui.js` (local backup), `src/backup-format.js` (metadata-line formatting), `src/drive-sync.js`, `src/drive-sync-ui.js` (cloud sync), `src/steps.js` (post-sync push hook), `src/settings.js` (opt-out preference + last-export/last-sync metadata), `src/auth.js` (Drive OAuth scope), `src/main.js` (wiring), `index.html` (`#tab-backup`, `#backup-controls`, `#cloud-controls`)

## Core Path

### Local Export / Import (`src/backup.js` + `src/backup-ui.js`)
1. `createBackup(db)` → `{ buildBackup, restoreBackup, computeSignature, hasUnpushedChanges, markPushed }`.
   `buildBackup()` reads `db.daily_records.toArray()` and `db.settings.toArray()`, guards the payload
   against `MAX_BACKUP_RECORDS` (100,000) / `MAX_BACKUP_BYTES` (16 MB), and returns a versioned
   envelope: `{ schema_version: BACKUP_SCHEMA_VERSION (1), exported_at, daily_records, settings }`.
2. `createBackupUI(doc, backup, reporter, confirmFn, settings = null)` renders an Export button
   (`data-action="export-backup"`, triggers a `<a download>` of the JSON via the shared Blob/anchor
   idiom, paired with a "🕒 Last local export: …" metadata line from `settings.getLastLocalExport()` /
   `formatLastExportLine` in `src/backup-format.js`) and a Restore file input (paired with an amber
   "⚠️ Overwrites local database" badge). `settings` is optional — when omitted the metadata line
   always reads "Never" and nothing is persisted (fails open).
3. Restore reads the selected file as text, `JSON.parse`s it, confirms via the injected `confirmFn`
   (guards against an accidental overwrite — declining stops before any Dexie write), then calls
   `backup.restoreBackup(parsed)`. `restoreBackup` first calls the pure, fail-fast
   `_validateEnvelope(parsed)` (schema_version match, array shape, size caps, per-row type checks,
   prototype-pollution-key rejection on every row) — **no Dexie write occurs if validation throws** —
   then applies both tables inside a single atomic Dexie `'rw'` transaction (`bulkPut`), so a
   mid-restore failure rolls back cleanly. On success it dispatches `data:records:mutated`, and a
   successful export separately persists its timestamp via `settings.setLastLocalExport` (logged, not
   surfaced, on a persistence failure — the export itself already succeeded).

### Manual Cloud Push / Pull (`src/drive-sync.js` + `src/drive-sync-ui.js`)
4. `createDriveSync({ getAccessToken, reporter, fetchFn, validator })` is the sole module that talks
   to the Drive v3 REST API — all calls go through the injected `fetchFn` (wired in `main.js` as
   `fetch.bind(window)`), never a bare/global `fetch`. `find()` lists `appDataFolder` for
   `step_tracker_backup.json` and caches the discovered file ID per instance (warms on `find()`/`pull()`,
   invalidated and retried once on a stale-ID 404 during `push()`).
5. `push(envelope, { silent })`: no access token → resolves the frozen `DRIVE_PUSH_SKIPPED` sentinel
   (never a silent success); otherwise POST-creates or PATCH-updates the file via a multipart-related
   upload (`buildMultipartBody` regenerates the MIME boundary up to 5× until it provably cannot leak
   into the body). Non-2xx/network failures reject (never resolve) so callers can surface ❌ — no HTTP
   status code ever appears in a reporter message or thrown error (diagnostics only via
   `console.error('[drive-sync]', …)`). `{ silent: true }` suppresses reporter signalling but still
   logs and still rejects (used by the fire-and-forget post-sync hook).
6. `pull()`: no token → returns `undefined` (reporter notified); no backup file → returns `null`;
   otherwise fetches and JSON-parses the file, then runs the injected `validator` (wired to
   `backup.js`'s `_validateEnvelope`) over the **untrusted remote payload** before returning — a
   validator rejection re-throws as `TypeError` so no restore write ever happens on a tampered payload.
7. `createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn, driveBackupPrefs)` renders "☁️ Back
   Up to Drive" / "🔄 Restore from Drive" buttons (the restore button paired with an amber "⚠️
   Overwrites local database" badge) plus the auto-upload toggle inline beside the backup button, and
   a "🕒 Last cloud sync: …" metadata line (`driveBackupPrefs.getLastDriveSync()` /
   `formatLastSyncLine` in `src/backup-format.js`). Manual backup-now reports ✅ only on an actual
   upload — a `DRIVE_PUSH_SKIPPED` result surfaces an informational ℹ️, never a false-success ✅ — and
   on success persists `{ at, bytes }` via `driveBackupPrefs.setLastDriveSync` (logged, not surfaced,
   on a persistence failure). Manual restore warns via the injected `confirmFn` before overwriting
   local data (last-write-wins), then re-validates defensively in `backup.restoreBackup` even though
   `driveSync.pull()` already validated, and dispatches `data:records:mutated` on success.

### Opt-Out Toggle for Background Auto-Upload (Task 27)
8. `src/settings.js` persists a `drive_backup_enabled` row (`DRIVE_BACKUP_ENABLED_KEY`, default
   `DEFAULT_DRIVE_BACKUP_ENABLED = true`) via `getDriveBackupEnabled()` / `setDriveBackupEnabled(bool)`.
   `driveSyncUI`'s checkbox (`data-action="toggle-drive-backup"`) reads/writes this setting through the
   injected `driveBackupPrefs` collaborator (`= settings` in `main.js`); a write failure reverts the
   checkbox so the UI never lies about the persisted state. **The toggle only gates the automatic
   post-sync upload — the manual "Back up to Drive" button always works regardless.**

### Automatic Post-Sync Push (Task 28 — coalescing + dirty-check)
9. `src/steps.js`'s `sync()` fires a fire-and-forget Drive push after every successful sync, gated in
   order: (a) `settings.getDriveBackupEnabled()` — disabled skips before any DB read; (b)
   `backup.hasUnpushedChanges()` — a cheap signature (`daily_records` count + newest row's `synced_at`)
   compared against the last-successfully-pushed signature; unchanged skips both re-serialisation and
   upload; (c) an in-flight closure guard (`postSyncPush`) set synchronously before the first `await` so
   an overlapping sync's hook sees it and skips — concurrent post-sync pushes upload exactly once. On
   success, `backup.markPushed()` records the new signature (only after the push succeeds, so a failed
   upload is retried on the next sync). The hook never re-throws and never surfaces a reporter message
   (`console.error('[drive-sync]', err)` only) — a Drive failure must never block or dirty the ✅ sync
   status line. The guard lives on the `steps.js` closure, never on `driveSync`, so manual pushes are
   always allowed through independently.

### OAuth Scope
10. `src/auth.js`'s `SCOPES` constant now also requests
    `https://www.googleapis.com/auth/drive.appdata` (in addition to the two Fitness scopes) so the
    single Google sign-in grants both step-data read and Drive AppData read/write access.

## Data Touchpoints
- **Entities**: Full `daily_records` + `settings` Dexie tables, serialised verbatim into the backup envelope (no field reduction); the `settings.drive_backup_enabled`, `settings.last_local_export_at`, and `settings.last_drive_sync` rows.
- **Tables**: `daily_records`, `settings` (Dexie) — read for `buildBackup`/push, written (via `bulkPut` in one `'rw'` transaction) for `restoreBackup`.
- **Remote**: One JSON file (`step_tracker_backup.json`) in the authenticated user's Google Drive `appDataFolder` (hidden, app-private storage — not visible in the user's regular Drive UI).
- **UI Surface**: `#tab-backup` (`.backup-grid` → `#backup-controls`, `#cloud-controls`) — errors/status surfaced via `reporter.sync()` / `reporter.db()` / `reporter.auth()`.

## Integrations
- **Type**: API Call
- **Target**: Google Drive v3 REST API (`appDataFolder` scope)
- **Channel**: `GET/POST/PATCH https://www.googleapis.com/drive/v3/files` (list/create/update metadata) and `https://www.googleapis.com/upload/drive/v3/files` (multipart upload); `Authorization: Bearer <token>` reusing the same access token obtained by `src/auth.js`.

## Error / Retry Surface
- `push()`: no-token path resolves `DRIVE_PUSH_SKIPPED` (not an error); non-2xx/network failures reject and are logged (`console.error('[drive-sync]', …)`) — never surfaced with a raw HTTP status; a stale cached file ID (404 on PATCH) triggers one automatic re-locate-and-retry.
- `find()` / `pull()`: swallow all errors, resolving `null` (fail-open) rather than rejecting — except a `pull()` payload that fails the injected validator, which rejects as `TypeError` before any restore write.
- Local `restoreBackup`: `_validateEnvelope` throws `TypeError` fail-fast (no Dexie write) on any structural/type violation, including reserved prototype-pollution keys (`__proto__`, `constructor`, `prototype`) on any row.
- Background post-sync push: fully silent — logged only, never rethrown, never touches `#sync-status`.
- Toggle write failure: checkbox is reverted to its prior state so the UI never claims a preference that failed to persist.

## Scope
- `src/backup.js` — local backup engine (`createBackup(db)`; pure exports `blobToBase64`, `base64ToBlob`, `_validateEnvelope`/`validateBackupPayload`, `BACKUP_SCHEMA_VERSION`, `BACKUP_FILENAME_PREFIX`, `MAX_BACKUP_RECORDS`, `MAX_BACKUP_BYTES`)
- `src/backup-ui.js` — local backup panel renderer (`createBackupUI(doc, backup, reporter, confirmFn, settings = null)`)
- `src/backup-format.js` — pure, DI-testable formatting helpers for the metadata lines (`formatBytes`, `formatLastExportLine`, `formatLastSyncLine`)
- `src/drive-sync.js` — Drive v3 AppData gateway (`createDriveSync({ getAccessToken, reporter, fetchFn, validator })`; exports `DRIVE_APPDATA_FILE_NAME`, `DRIVE_API_BASE_URL`, `DRIVE_PUSH_SKIPPED`)
- `src/drive-sync-ui.js` — cloud sync panel renderer (`createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn, driveBackupPrefs)`)
- `src/settings.js` — `drive_backup_enabled` preference (`getDriveBackupEnabled`, `setDriveBackupEnabled`, `DRIVE_BACKUP_ENABLED_KEY`, `DEFAULT_DRIVE_BACKUP_ENABLED`) plus last-export/last-sync metadata (`getLastLocalExport`, `setLastLocalExport`, `getLastDriveSync`, `setLastDriveSync`, `LAST_LOCAL_EXPORT_KEY`, `LAST_DRIVE_SYNC_KEY`)
- `src/steps.js` — post-sync fire-and-forget push hook (coalescing + dirty-check), injected `driveSync`/`backup`/`settings` collaborators
- `src/auth.js` — `drive.appdata` OAuth scope
- `src/main.js` — composition-root wiring (panel mounts, confirm adapters)
- `index.html` — `#tab-backup`, `.backup-grid`, `#backup-controls`, `#cloud-controls`

## Tests
- `src/backup.test.js` — envelope build/validate/restore, size-cap guards, prototype-pollution rejection, atomic transaction rollback, `blobToBase64`/`base64ToBlob` round-trip, `hasUnpushedChanges`/`markPushed` signature logic.
- `src/backup-ui.test.js` — render, export download seam, last-export metadata line + persistence, restore confirm-gate (confirm/cancel paths), restore file read/parse/validate, `data:records:mutated` dispatch, error paths.
- `src/backup-format.test.js` — `formatBytes`/`formatLastExportLine`/`formatLastSyncLine` pure formatting (null/invalid input, same-day vs. prior-day dates).
- `src/drive-sync.test.js` — `find`/`push`/`pull` DI isolation (injected `fetchFn`), no-token paths, multipart boundary collision handling, stale-cache 404 retry, silent-mode reporter suppression, validator rejection path.
- `src/drive-sync-ui.test.js` — render, backup-now/restore-from-cloud handlers, `DRIVE_PUSH_SKIPPED` vs. success reporting, last-sync metadata line + persistence, auto-backup toggle read/write/revert-on-failure.
- `src/settings.test.js` — `getLastLocalExport`/`setLastLocalExport`, `getLastDriveSync`/`setLastDriveSync` round-trip, fail-open reads, guard-clause writes.
- `src/steps.test.js` — post-sync push gating (opt-out, dirty-check, in-flight coalescing).
- `src/main.test.js` — `backupUI`/`driveSyncUI` wiring with the confirm adapter and `settings` collaborator.

## Notes
- Local backup/restore has **no network dependency**; Drive cloud sync requires an active Google session (reuses the token from `src/auth.js`, no separate consent step beyond the added `drive.appdata` scope).
- The Drive backup lives in the app-private `appDataFolder`, not the user's visible "My Drive" — invisible outside this app's own UI.
- Manual "Back Up to Drive" / "Restore from Drive" always work regardless of the auto-upload toggle; the toggle only gates the silent post-sync hook.
