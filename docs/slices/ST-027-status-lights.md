Story ID: ST-027

# ST-027 — Status Lights and a Backup Check That Means Something

## Context

Owner feedback on v0.3.0 (2026-09-29): Today's status line showed "✅ Connected" next to "☁️ Cloud Synced", and it wasn't clear what either meant or whether both were needed.

* "✅ Connected" is the step source's access (Health Connect in the app, Google in the web viewer).
* "☁️ Cloud Synced" was the storage-protection badge: in the app it only mirrored the **automatic backup** toggle — it said "Cloud Synced" even when Google Drive wasn't connected or the last upload failed, and its warning ("⚠️ Backup Disabled") could never appear, because app storage always counts as protected.
* The same pill (`#db-status`) was also the target of `reporter.db()`, a general message channel (≈40 call sites: load errors, "✅ Backup saved to …", "✅ DB ready (n records)"), so messages and the badge overwrote each other.

Owner decisions: show one connection pill with a coloured status light — green / amber / red glow and the words **Connected** / **Disconnected** — instead of ✅ / ⚠️; replace "Cloud Synced" with a backup pill that appears only when backup needs attention.

## Scope

* **Status light** — `src/status-light.js` renders a pill as a glowing dot (green `ok`, amber `warn`, red `error`) plus a short label; the full message becomes the pill's `title` / accessible name. The connection pill (`#auth-status`) maps its message's leading symbol to a level (✅ → green **Connected**; ⚠️ ℹ️ → amber **Disconnected**; 🔑 ❌ and anything else → red **Disconnected**).
* **Backup pill** (Android app only) — `#backup-status`, hidden while backup is fine; amber **Not backed up** when Google Drive isn't connected, automatic backup is off, this device has never backed up, or its last backup is more than 3 days old. No warning when another device is the primary (it does the backing up). Tapping it opens Backup & restore. It refreshes at launch, after every sync, and whenever the Drive panel changes (connect, toggle, upload, make primary).
* **Messages** — `reporter.db(text)` shows a short toast instead of writing a pill; initDB no longer announces "DB ready".
* **Retire the storage-protection badge** — `#db-status`, the badge text and the silent `navigator.storage.persist()` gestures go: app storage is never evicted, and the web viewer's copy can be re-downloaded from Drive (ST-023). The Backup & restore storage panel stays (its own Drive / on-device rows).

## Out of Scope

* Showing the time of the last backup on Today (the Drive panel has it).
* Background backups while the app is closed.

## Acceptance Criteria

* Today shows at most two pills in the app — connection (light + Connected/Disconnected) and, only when needed, Not backed up — and one in the web viewer.
* No ✅/⚠️ symbols in the pills; the full message is still available as the pill's title / accessible name.
* A load error or "Backup saved to …" appears as a toast, never inside a pill.
* Tests for the light renderer, the backup rule (every reason, the primary-device exception, the 3-day threshold), the reporter, the wiring, and the markup/CSS.

## Implementation

* New `src/status-light.js`, `src/backup-status.js`; [ui-status.js](../../src/ui-status.js) (`auth` renders a light, `db` toasts); [index.html](../../index.html) status line; [styles.css](../../styles.css) `.status-light`; [main.js](../../src/main.js) wiring; removed `src/storage.js` and `src/storage-health.js` (the badge and the persist gestures).

## As built

* `levelOf` maps ✅ → green, ⚠️/ℹ️ → amber, 🔑/❌/anything else → red; `renderStatusPill` writes the light, the label, `title`, `aria-label` and `data-level`. The connection pill starts red **Disconnected** in `index.html`.
* `computeBackupStatus` / `createBackupStatus` (`STALE_BACKUP_MS` = 3 days). `main.js` counts Drive as connected when the connection has a token **or** the `google_drive_connected` flag is set, so the silent reconnect at launch doesn't flash a warning; the pill refreshes at launch, after each sync and on `data:drive-sync:refresh` / `data:storage-health:refresh`.
* Removed: `src/storage.js`, `src/storage-health.js` (+ tests), `#db-status` and its click handler, the silent persist requests (Connect, Sync, auto-backup toggle), `createStorageHealthUI`'s `reporter` and `createDriveSyncUI`'s `nav` parameters, the "DB ready" message.
* Verified: unit tests for every rule and the wiring; in the dev browser at 390 px — the web viewer's red **Disconnected**, and the app's green **Connected** with an amber **Not backed up** pill rendered through the real modules.
