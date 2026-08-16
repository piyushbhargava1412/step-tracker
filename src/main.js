// main.js — composition root
// Wires all concrete modules together and bootstraps the application.

import { CLIENT_ID } from './config.js'
import { createStatusReporter } from './ui-status.js'
import { createDb, initDB } from './db.js'
import { requestPersistentStorage } from './storage.js'
import { createAuth } from './auth.js'
import { createStepSync } from './steps.js'
import { initTabs } from './tabs.js'
import { createGoal } from './goal.js'
import { createProgressUI } from './progress-ui.js'
import { createStreak } from './streak.js'
import { createStreakUI } from './streak-ui.js'
import { createCalendar } from './calendar.js'
import { createCalendarUI } from './calendar-ui.js'
import { createMonthOverview } from './month-overview.js'
import { createRecords } from './records.js'
import { processImage } from './image-processor.js'
import { createSearch, computeNearMisses } from './search.js'
import { createSearchUI } from './search-ui.js'
import { createExporter } from './exporter.js'
import { createChallenge } from './challenge.js'
import { createChallengeUI } from './challenge-ui.js'
import { createSettings } from './settings.js'
import { createSettingsUI } from './settings-ui.js'
import { createConfirmAdapter } from './confirm.js'
import { createBackup, _validateEnvelope } from './backup.js'
import { createBackupUI } from './backup-ui.js'
import { createDriveSync } from './drive-sync.js'
import { createDriveSyncUI } from './drive-sync-ui.js'
import { switchTab } from './tabs.js'
import {
  refreshStorageProtectionBadge,
  requestSilentPersistAndRefreshBadge,
  BACKUP_DISABLED_TEXT,
} from './storage-health.js'
import { createStorageHealthUI } from './storage-health-ui.js'
import { createSwRegister } from './sw-register.js'

const MS_PER_DAY = 86_400_000

// localStorage key recording that the user has connected their Google account.
// Only a boolean flag is stored — never the access token itself. On a later
// page load it signals the composition root to attempt a silent session
// restore (GSI `prompt: ''`), so a refresh no longer forces a reconnect.
export const GOOGLE_CONNECTED_KEY = 'google_connected'

/**
 * Render the header's "Sync: X days ago" label from the most recently synced
 * record. Fully fail-open: a missing element or store read leaves the label at
 * its placeholder text and never throws or rejects.
 *
 * @param {object} db  - Dexie database exposing `daily_records`.
 * @param {Document} doc - The DOM document (injected for testability).
 * @returns {Promise<void>}
 */
export async function _renderLastSyncLabel(db, doc = document) {
  const el = doc?.getElementById?.('last-sync')
  if (!el) return

  const latest = await db?.daily_records?.orderBy?.('date')?.last?.()
  if (!latest?.synced_at) return

  const elapsed = Date.now() - new Date(latest.synced_at).getTime()
  const days = Math.max(0, Math.round(elapsed / MS_PER_DAY))
  el.textContent =
    days === 0 ? 'Sync: just now' : `Sync: ${days} day${days === 1 ? '' : 's'} ago`
}

export async function bootstrap(doc = document, storage = window.localStorage) {
  // 1. Build shared reporter
  const reporter = createStatusReporter(doc)

  // 2. Config object — expose CLIENT_ID as a plain object for injection
  const config = { CLIENT_ID }

  // 3. Init DB (fail-open: catch so later steps still run)
  const db = createDb()
  try {
    await initDB(db, reporter)
  } catch (err) {
    console.error('[main] initDB failed, continuing', err)
  }

  // 4. Request persistent storage (fail-open)
  try {
    await requestPersistentStorage(reporter)
  } catch (err) {
    console.error('[main] requestPersistentStorage failed, continuing', err)
  }

  // 5. Auth
  const auth = createAuth(config, reporter)
  auth.init()

  // 6. Step sync engine — created after backup/driveSync (see below) so collaborators can be injected.

  // 6a. Goal + progress UI + streak engine (wired after db is ready)
  const goal = createGoal(db)
  const streak = createStreak(db, goal)
  const streakUI = createStreakUI(doc, streak, reporter)
  const calendar = createCalendar(db, goal)
  const records = createRecords(db)
  const monthOverview = createMonthOverview(doc, calendar, reporter)
  const search = createSearch(db)
  const exporter = createExporter(doc)
  const searchUI = createSearchUI(doc, search, exporter, reporter, computeNearMisses, records, processImage)
  const calendarUI = createCalendarUI(doc, db, calendar, reporter, records, processImage, monthOverview)
  const challenge = createChallenge(db)
  const challengeUI = createChallengeUI(doc, challenge, db, reporter)
  const settings = createSettings(db)
  const settingsUI = createSettingsUI(doc, settings, reporter, createConfirmAdapter(window))

  // Redefine the #db-status badge to account for Drive Cloud Auto-Sync state
  // now that settings is available (fail-open — a read error leaves whatever
  // requestPersistentStorage already wrote in place).
  try {
    await refreshStorageProtectionBadge(reporter, settings, navigator)
  } catch (err) {
    console.error('[main] refreshStorageProtectionBadge failed, continuing', err)
  }

  // ST-012: Backup engine + UI (fail-open)
  let backup = null
  let backupUI = null
  try {
    backup = createBackup(db)
  } catch (err) {
    console.error('[main] createBackup failed, continuing', err)
  }
  try {
    backupUI = createBackupUI(doc, backup, reporter, createConfirmAdapter(window), settings)
  } catch (err) {
    console.error('[main] createBackupUI failed, continuing', err)
  }

  // ST-012: Drive sync gateway + UI (fail-open)
  let driveSync = null
  let driveSyncUI = null
  try {
    driveSync = createDriveSync({ getAccessToken: auth.getAccessToken.bind(auth), reporter, fetchFn: fetch.bind(window), validator: _validateEnvelope })
  } catch (err) {
    console.error('[main] createDriveSync failed, continuing', err)
  }
  try {
    driveSyncUI = createDriveSyncUI(doc, driveSync, backup, reporter, createConfirmAdapter(window), settings, navigator)
  } catch (err) {
    console.error('[main] createDriveSyncUI failed, continuing', err)
  }

  // Storage & Data Health panel (fail-open) — replaces the old nagging
  // persistence modal with a plain status panel + direct-action button.
  let storageHealthUI = null
  try {
    storageHealthUI = createStorageHealthUI(doc, settings, reporter, navigator)
  } catch (err) {
    console.error('[main] createStorageHealthUI failed, continuing', err)
  }

  // ST-013: Service Worker registration (fail-open; PROD-gated inside the
  // factory — the dev server must never register a SW over Vite HMR assets).
  try {
    await createSwRegister({ nav: navigator, config: { prod: import.meta.env.PROD } }).register()
  } catch (err) {
    console.error('[main] SW registration failed, continuing', err)
  }

  // 6b. Step sync engine — wired here so driveSync + backup are available as injected collaborators
  const stepSync = createStepSync(auth, db, reporter, doc, driveSync, backup, settings)

  // Mount backup + cloud + storage-health panels into their own containers so
  // no render clears another's output (each render() wipes its container first).
  const backupControls = doc.getElementById('backup-controls')
  const cloudControls = doc.getElementById('cloud-controls')
  const storageHealthControls = doc.getElementById('storage-health-controls')
  if (backupControls) {
    try { backupUI?.render?.(backupControls) } catch (err) { console.error('[main] backupUI.render failed, continuing', err) }
  }
  if (cloudControls) {
    try { driveSyncUI?.render?.(cloudControls) } catch (err) { console.error('[main] driveSyncUI.render failed, continuing', err) }
  }
  if (storageHealthControls) {
    try { await storageHealthUI?.render?.(storageHealthControls) } catch (err) { console.error('[main] storageHealthUI.render failed, continuing', err) }
  }

  // The Storage Health panel and the cloud-sync toggle live in separate
  // modules/mount points; drive-sync-ui.js dispatches this event rather than
  // holding a direct reference so a Drive-state change (toggle, manual push)
  // still refreshes the panel's Drive row.
  doc.addEventListener('data:storage-health:refresh', async () => {
    if (!storageHealthControls) return
    try {
      await storageHealthUI?.render?.(storageHealthControls)
    } catch (err) {
      console.error('[main] storageHealthUI.render failed after refresh event, continuing', err)
    }
  })
  const progressUI = createProgressUI(doc, goal, db, reporter, async () => {
    try {
      await streakUI.render()
    } catch (err) {
      console.error('[main] streakUI.render failed after goal change, continuing', err)
    }
    try {
      await calendarUI.render()
    } catch (err) {
      console.error('[main] calendarUI.render failed after goal change, continuing', err)
    }
    try {
      await monthOverview.render()
    } catch (err) {
      console.error('[main] monthOverview.render failed after goal change, continuing', err)
    }
  })

  // 7. Bind auth button. Connect/Reconnect is a storage-protection-relevant
  // user gesture: silently request navigator.storage.persist() alongside it
  // (fire-and-forget — never blocks or delays the auth flow).
  const authBtn = doc.getElementById('auth-btn')
  if (authBtn) {
    authBtn.addEventListener('click', () => {
      auth.requestToken()
      requestSilentPersistAndRefreshBadge(reporter, settings, navigator).catch((err) => {
        console.error('[main] requestSilentPersistAndRefreshBadge failed, continuing', err)
      })
    })
  }

  // 7a. Shared post-sync re-render pipeline (SF-12: re-render after each sync).
  // Used by the sync button and by the auto-sync-on-connect hook below, so a
  // freshly-obtained token and a manual click converge on the same refresh.
  const runSync = async () => {
    await stepSync.sync()
    progressUI.render()
    try {
      await streakUI.render()
    } catch (err) {
      console.error('[main] streakUI.render failed after sync, continuing', err)
    }
    try {
      await calendarUI.render()
    } catch (err) {
      console.error('[main] calendarUI.render failed after sync, continuing', err)
    }
    try {
      await monthOverview.render()
    } catch (err) {
      console.error('[main] monthOverview.render failed after sync, continuing', err)
    }
    try {
      await challengeUI.render()
    } catch (err) {
      console.error('[main] challengeUI.render failed after sync, continuing', err)
    }
  }

  // 7b. Auto-sync the moment a token arrives — from the first connect click or
  // a silent session restore — so the user never has to hit Sync Steps twice.
  // The flag is persisted so the next page load knows to attempt a restore.
  auth.onTokenReceived(async () => {
    try {
      storage?.setItem(GOOGLE_CONNECTED_KEY, '1')
    } catch (err) {
      console.error('[main] failed to persist google connection flag, continuing', err)
    }
    await runSync()
  })

  // 7c. Restore the connection after a refresh: when the user connected before,
  // ask GSI to silently hand back a fresh token (`prompt: ''` never shows UI).
  // The 7b hook fires on success and auto-syncs. If Google's session expired,
  // the callback delivers an error and the user simply clicks Connect again.
  try {
    if (storage?.getItem(GOOGLE_CONNECTED_KEY) === '1') {
      auth.requestToken({ prompt: '' })
    }
  } catch (err) {
    console.error('[main] failed to read google connection flag, continuing', err)
  }

  // 8. Render settings modal interior at bootstrap (before wiring the button)
  try {
    await settingsUI.render()
  } catch (err) {
    console.error('[main] settingsUI.render failed, continuing', err)
  }

  // 8. Bind settings button
  const settingsBtn = doc.getElementById('settings-btn')
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => settingsUI.open())
  }

  // 8. Bind sync button (SF-12: re-render after each sync click). Sync Steps
  // is a storage-protection-relevant user gesture: silently request
  // navigator.storage.persist() alongside it (fire-and-forget, never delays
  // or blocks the sync pipeline).
  const syncBtn = doc.getElementById('sync-btn')
  if (syncBtn) {
    syncBtn.addEventListener('click', () => {
      requestSilentPersistAndRefreshBadge(reporter, settings, navigator).catch((err) => {
        console.error('[main] requestSilentPersistAndRefreshBadge failed, continuing', err)
      })
      runSync()
    })
  }

  // 8a. Register data:records:mutated listener for override recalculation (fail-open)
  doc.addEventListener('data:records:mutated', async () => {
    try {
      progressUI.render()
    } catch (err) {
      console.error('[main] progressUI.render failed after mutation, continuing', err)
    }
    try {
      await streakUI.render()
    } catch (err) {
      console.error('[main] streakUI.render failed after mutation, continuing', err)
    }
    try {
      await calendarUI.render()
    } catch (err) {
      console.error('[main] calendarUI.render failed after mutation, continuing', err)
    }
    try {
      await monthOverview.render()
    } catch (err) {
      console.error('[main] monthOverview.render failed after mutation, continuing', err)
    }
    try {
      await challengeUI.render()
    } catch (err) {
      console.error('[main] challengeUI.render failed after mutation, continuing', err)
    }
    try {
      await searchUI.render()
    } catch (err) {
      console.error('[main]', err)
    }
    if (backupControls) {
      try {
        backupUI?.render?.(backupControls)
      } catch (err) {
        console.error('[main] backupUI.render failed after mutation, continuing', err)
      }
    }
    if (cloudControls) {
      try {
        driveSyncUI?.render?.(cloudControls)
      } catch (err) {
        console.error('[main] driveSyncUI.render failed after mutation, continuing', err)
      }
    }
  })

  // 8b. Populate the header "Sync: …" label from the newest record (fail-open)
  try {
    await _renderLastSyncLabel(db, doc)
  } catch (err) {
    console.error('[main] last-sync label update failed, continuing', err)
  }

  // 9. Init tab navigation
  const tabBar = doc.querySelector('.tab-bar')
  if (tabBar) {
    initTabs(tabBar, doc)
  }

  // 9a. #db-status pill: when it reads "Backup Disabled" (unbacked-up state),
  // clicking it jumps straight to the Backup tab instead of popping up a
  // modal — the badge is otherwise informational and not clickable.
  const dbStatusEl = doc.getElementById('db-status')
  if (dbStatusEl) {
    dbStatusEl.addEventListener('click', () => {
      if (dbStatusEl.textContent === BACKUP_DISABLED_TEXT) {
        switchTab('backup', doc)
      }
    })
  }

  // 10. Render Today's Progress card on page load (fail-open)
  try {
    await progressUI.render()
  } catch (err) {
    console.error('[main] progressUI.render failed, continuing', err)
  }

  // 11. Render streak card on page load (SF-10, fail-open)
  try {
    await streakUI.render()
  } catch (err) {
    console.error('[main] streakUI.render failed, continuing', err)
  }

  // 12. Render calendar on page load (SF-7, fail-open)
  try {
    await calendarUI.render()
  } catch (err) {
    console.error('[main] calendarUI.render failed, continuing', err)
  }

  // 13. Render current-month overview on page load (mockup dashboard, fail-open)
  try {
    await monthOverview.render()
  } catch (err) {
    console.error('[main] monthOverview.render failed, continuing', err)
  }

  // 14. Render search UI on page load (fail-open)
  try {
    await searchUI.render()
  } catch (err) {
    console.error('[main] searchUI.render failed, continuing', err)
  }

  // 15. Render challenge card on page load (fail-open)
  try {
    await challengeUI.render()
  } catch (err) {
    console.error('[main] challengeUI.render failed, continuing', err)
  }
}

// Register the bootstrap listener when running as the real app entry point.
// In tests, DOMContentLoaded is dispatched manually after mocks are configured.
if (typeof import.meta !== 'undefined' && import.meta.env?.MODE !== 'test') {
  document.addEventListener('DOMContentLoaded', () => bootstrap());
}
