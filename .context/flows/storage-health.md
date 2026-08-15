# Flow: Storage Health — Protection Matrix, Silent Persist Gestures & Panel

> Added: ST-013 — 2026-08-15 (replaces the ST-012 persistent-storage guidance modal)

<!-- context-meta
verification-commit: HEAD
generated-at: 2026-08-15T00:00:00Z
confidence: medium
-->

## Overview
Redefines what "protected" means for the app's local step data: instead of nagging the user with
an eviction-risk modal whenever `navigator.storage.persisted()` is false, the app now treats an
enabled Google Drive Cloud Auto-Sync as an equally valid safety net. A pure protection-matrix
(`src/storage-health.js`) combines the `drive_backup_enabled` setting with the browser's persisted-
storage grant into a single `#db-status` header pill and a "💾 Storage & Data Health" panel
(`src/storage-health-ui.js`) on the Backup tab. `navigator.storage.persist()` is requested silently
(no prompt, no modal) behind three explicit user gestures — Sync Steps, Connect/Reconnect Google
Account, and toggling Drive auto-backup — plus directly via the panel's own button. This flow
replaces `src/storage-modal.js` (deleted), which previously opened an explanatory popup on badge
click; clicking the badge now simply jumps to the Backup tab when unprotected.

## Entry Points
- **Type**: App lifecycle (browser) — badge computed at bootstrap, after `settings` is ready
- **Type**: UI Event (browser) — `#auth-btn` click (Connect/Reconnect), `#sync-btn` click (Sync
  Steps), `[data-action="toggle-drive-backup"]` change (Drive Cloud Sync panel) → each silently
  requests `navigator.storage.persist()` and refreshes the header badge
- **Type**: UI Event (browser) — `[data-action="request-storage-protection"]` click (Storage Health
  panel button) → directly requests `navigator.storage.persist()`, no modal
- **Type**: UI Event (browser) — `#db-status` click, only when its text reads "⚠️ Backup Disabled"
  → `switchTab('backup', doc)` (`src/tabs.js`); a no-op in any other badge state
- **File**: `src/storage-health.js` (pure matrix + orchestration), `src/storage-health-ui.js`
  (panel renderer), `src/drive-sync-ui.js` (toggle gesture + refresh-event dispatch), `src/main.js`
  (bootstrap wiring, gesture wiring, badge-click navigation), `src/storage.js` (unchanged — the
  underlying bootstrap-time `requestPersistentStorage` capability), `index.html`
  (`#storage-health-controls`), `styles.css` (`.storage-health-*`)

## Core Path

### Protection matrix (`src/storage-health.js`)
1. `computeBadgeText({ driveAutoSyncEnabled, persisted })` — pure function:
   - `driveAutoSyncEnabled === true` → `CLOUD_SYNCED_TEXT` ("☁️ Cloud Synced"), regardless of
     `persisted` (cloud backup alone is enough).
   - `driveAutoSyncEnabled === false, persisted === true` → `PERSISTED_TEXT` ("🛡️ Storage Safe",
     imported from `src/storage.js` — the existing single source of truth for that copy).
   - `driveAutoSyncEnabled === false, persisted === false` → `BACKUP_DISABLED_TEXT`
     ("⚠️ Backup Disabled").
   `isProtected(...)` mirrors the same OR-logic as a boolean for any future consumer.
2. `refreshStorageProtectionBadge(reporter, settings, nav = navigator)` re-reads
   `settings.getDriveBackupEnabled()` and `nav.storage.persisted()` in parallel (each individually
   fail-open — a rejected read defaults to `false` and is logged via
   `console.error('[storage-health]', err)`, never blocking the other signal), then writes the
   combined text via `reporter.db(...)`.
3. `requestSilentPersistAndRefreshBadge(reporter, settings, nav = navigator)` calls
   `nav.storage.persist()` with no UI feedback (errors caught/logged, never thrown), then always
   calls `refreshStorageProtectionBadge` so the badge reflects the true resulting state whether the
   grant succeeded, was silently declined, or errored.

### Storage Health panel (`src/storage-health-ui.js`)
4. `createStorageHealthUI(doc, settings, reporter, nav = navigator)` renders a "💾 Storage & Data
   Health" panel into `#storage-health-controls` (mounted above the existing `.backup-grid` in
   `#tab-backup`): a "Google Drive Cloud Backup:" row (`🟢 Active ([size])` when
   `drive_backup_enabled` is on and a last-sync size is known, `🟢 Active` with no size before the
   first sync, `⚪ Disabled` when off — reusing `formatBytes` from `backup-format.js`), a "Local
   Browser Storage:" row (`🟢 Protected` / `🟡 Unpersisted` from `nav.storage.persisted()`), and a
   `[ 🛡️ Request Browser Storage Protection ]` button.
5. The button calls `nav.storage.persist()` directly — **no confirmation modal** — and on a grant
   updates the Local Browser Storage row in place immediately; either way it then calls
   `refreshStorageProtectionBadge` so the header pill never disagrees with the panel. All reads are
   individually fail-open (a settings/Dexie error defaults the Drive row to "Disabled" and logs).
   No innerHTML; AbortController-scoped listeners so re-render never accumulates handlers.

### Cross-panel refresh (event-based, no direct references)
6. The Storage Health panel and the Drive Cloud Sync panel are separate modules mounted into
   separate containers. Rather than holding a reference to each other, `src/drive-sync-ui.js`
   dispatches a `data:storage-health:refresh` custom event on `doc` after (a) a successful
   `setDriveBackupEnabled` toggle write (alongside the silent persist request) and (b) a successful
   manual "Back Up to Drive" push (so a freshly-recorded backup size shows up in the Drive row).
   `src/main.js` listens for this event at bootstrap and re-renders `storageHealthUI` into
   `#storage-health-controls`.

### Removed: the ST-012 persistent-storage guidance modal
7. `src/storage-modal.js` (and its dedicated `#db-status`-click-opens-a-modal behavior) has been
   deleted. The badge is no longer a launcher for an explanatory popup — a click now either
   navigates to the Backup tab (unprotected state) or does nothing (already-safe states). Storage
   protection is requested silently behind ordinary product gestures instead of being surfaced as a
   dedicated ask.

## Data Touchpoints
- **Entities**: Reads `settings.drive_backup_enabled` (via `getDriveBackupEnabled()`,
  `src/settings.js`) and `settings.last_drive_sync` (via `getLastDriveSync()`) — no new persisted
  state introduced by this flow.
- **Tables**: None written by this flow; `db.settings` reads only.
- **UI Surface**: `#db-status` header pill (`src/ui-status.js`'s `reporter.db(text)`), the
  `#storage-health-controls` panel inside `#tab-backup`.
- **Browser API**: `navigator.storage.persist()` (write/request) and `navigator.storage.persisted()`
  (read) — Storage API, no network.

## Integrations
- **Type**: Browser API
- **Target**: `navigator.storage.persist()` / `navigator.storage.persisted()`
- **Channel**: N/A (in-browser only, no network)

## Error / Retry Surface
- Every read in `refreshStorageProtectionBadge` and the panel's `_refreshStatuses` is individually
  try/catch-guarded and fails open (`false`/`⚪ Disabled` default) — one failing signal never
  prevents the other from still producing a correct, informative state.
- `requestSilentPersistAndRefreshBadge` and the panel's protection button both swallow
  `persist()` rejections (logged via `console.error`, never surfaced to the user, never thrown) —
  a declined or errored request is indistinguishable from a normal browser heuristic decline and
  never blocks the calling gesture (auth, sync, toggle) from completing.
- `data:storage-health:refresh` dispatch/handling is itself guarded (`try/catch` around
  `dispatchEvent` in `drive-sync-ui.js`, around `render` in `main.js`) so a DOM/render failure never
  breaks the triggering action (toggle write, manual backup).

## Scope
- `src/storage-health.js` — pure matrix (`computeBadgeText`, `isProtected`) + orchestration
  (`refreshStorageProtectionBadge`, `requestSilentPersistAndRefreshBadge`); exports
  `CLOUD_SYNCED_TEXT`, `BACKUP_DISABLED_TEXT` (re-imports `PERSISTED_TEXT` from `src/storage.js`)
- `src/storage-health-ui.js` — panel renderer (`createStorageHealthUI(doc, settings, reporter, nav = navigator)` → `{ render }`)
- `src/drive-sync-ui.js` — silent-persist-on-toggle + `data:storage-health:refresh` dispatch (toggle
  success, manual backup success); `createDriveSyncUI(..., driveBackupPrefs, nav = navigator)`
- `src/main.js` — bootstrap badge refresh (after `settings` is ready), gesture wiring on
  `#auth-btn`/`#sync-btn`, `storageHealthUI` mount + `data:storage-health:refresh` listener,
  `#db-status` click → `switchTab('backup', doc)` guard
- `src/tabs.js` — `switchTab(tabName, doc)` (unchanged; reused as the navigation target)
- `src/storage.js` — unchanged; `requestPersistentStorage` (bootstrap-time attempt) and
  `PERSISTED_TEXT` remain the single source of truth for that one badge string
- `index.html` — `#storage-health-controls` (inside `#tab-backup`, above `.backup-grid`)
- `styles.css` — `.storage-health-panel`, `.storage-health-row`, `.storage-health-label`,
  `.storage-health-value`, `.storage-health-action`

## Tests
- `src/storage-health.test.js` — matrix truth table, badge-refresh fail-open behavior per signal,
  silent-persist-then-refresh ordering and error tolerance.
- `src/storage-health-ui.test.js` — panel rendering per drive/persisted state combination, button
  grant/decline/error paths, in-place local-status update, header-badge refresh via the button,
  pending/disabled button state, re-render listener scoping, no-innerHTML contract.
- `src/drive-sync-ui.test.js` — toggle-triggered silent persist + badge refresh +
  `data:storage-health:refresh` dispatch (including the failed-write path, which must trigger
  neither), manual-backup-success `data:storage-health:refresh` dispatch.
- `src/main.test.js` — "Storage Health wiring" describe block: bootstrap-time badge refresh call
  shape, panel mount + fail-open when the container is missing, refresh-event re-render,
  gesture-triggered persist calls on `#auth-btn`/`#sync-btn`, `#db-status` click navigation
  (asserted against the mocked `switchTab`) gated on the exact badge text.

## Notes
- The header pill is deliberately **not** clickable in the two "safe" states (`Cloud Synced`,
  `Storage Safe`) — only `Backup Disabled` responds to a click, mirroring the old modal's
  "only opens when Unprotected" guard but redirecting to the Backup tab instead of a popup.
- `src/storage.js`'s bootstrap-time `requestPersistentStorage` call is unchanged and still runs
  first; `refreshStorageProtectionBadge` runs immediately after (once `settings` exists) and
  overwrites the badge with the drive-aware text, so the two never race in a user-visible way.
