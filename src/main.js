// main.js — composition root
// Wires all concrete modules together and bootstraps the application.

import '@fontsource-variable/manrope'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'

import { CLIENT_ID } from './config.js'
import { createStatusReporter } from './ui-status.js'
import { createDb, initDB } from './db.js'
import { requestPersistentStorage } from './storage.js'
import { selectAuth } from './platform/auth.js'
import { createGoogleDriveConnection } from './platform/native/google-drive-connection.js'
import { createPrimaryDevice } from './primary-device.js'
import { createSyncTrigger } from './sync-trigger.js'
import { onAppResume, onBackButton } from './platform/app-lifecycle.js'
import { createStepSync } from './steps.js'
import { Health } from '@capgo/capacitor-health'
import { AppLauncher } from '@capacitor/app-launcher'
import { isNativePlatform } from './platform/capabilities.js'
import { createFileSaver } from './platform/files.js'
import { selectStorageManager } from './platform/storage-manager.js'
import { selectStepSource, connectLabelFor } from './platform/step-source.js'
import { createNavigator } from './navigation.js'
import { createPullToRefresh } from './pull-to-refresh.js'
import { createGoal } from './goal.js'
import { createProgressUI } from './progress-ui.js'
import { createStreak } from './streak.js'
import { createStreakUI } from './streak-ui.js'
import { createCalendar } from './calendar.js'
import { createCalendarUI } from './calendar-ui.js'
import { createWeek } from './week.js'
import { createCalendarWeekUI } from './calendar-week-ui.js'
import { initCalendarViewSwitch } from './calendar-view-switch.js'
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
import { selectShare } from './platform/share.js'
import { createOnboardingUI } from './onboarding-ui.js'
import { createProofLightbox } from './override-form.js'
import {
  refreshStorageProtectionBadge,
  requestSilentPersistAndRefreshBadge,
  BACKUP_DISABLED_TEXT,
} from './storage-health.js'
import { createStorageHealthUI } from './storage-health-ui.js'
import { createSwRegister } from './sw-register.js'
import { createAnalytics } from './analytics.js'
import { createAnalyticsUI } from './analytics-ui.js'
import { createGamification } from './gamification.js'
import { createGamificationUI } from './gamification-ui.js'
import { createOdysseyUI } from './odyssey-ui.js'
import { computeOdysseyProgress } from './odyssey.js'

const MS_PER_DAY = 86_400_000

/** "0.2.0" — injected by Vite from package.json (vite.config.js `define`). */
const APP_VERSION = typeof __APP_VERSION__ === 'undefined' ? '' : __APP_VERSION__

/**
 * Render each view in turn; a view that throws or rejects is logged and the
 * rest still render (fail-open).
 *
 * @param {Array<[string, { render: Function }|null|undefined]>} views  [name, view]
 * @param {string} [context]  e.g. "sync" → "[main] calendarUI.render failed after sync, continuing"
 * @returns {Promise<void>}
 */
export async function _renderViews(views, context) {
  const suffix = context ? ` after ${context}` : ''
  for (const [name, view] of views) {
    try {
      await view?.render?.()
    } catch (err) {
      console.error(`[main] ${name}.render failed${suffix}, continuing`, err)
    }
  }
}


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
  // 0. Platform: the Android app (Capacitor) or a browser. Everything that
  //    differs between them is chosen here, through src/platform/*.
  const isNative = isNativePlatform()
  const storageManager = selectStorageManager({ isNative, nav: navigator })
  const fileSaver = createFileSaver({ isNative, doc })

  // 1. Build shared reporter
  const reporter = createStatusReporter(doc, { connectLabel: connectLabelFor(isNative) })

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
    await requestPersistentStorage(reporter, storageManager)
  } catch (err) {
    console.error('[main] requestPersistentStorage failed, continuing', err)
  }

  // 5. Auth (fail-open: a missing/late-loading GSI script must not abort bootstrap).
  //    Google Identity Services in the browser; native Google sign-in (Drive
  //    only) in the Android app — ST-020.
  const auth = selectAuth({ isNative, config, reporter, storage })
  try {
    auth.init()
  } catch (err) {
    console.error('[main] auth.init failed, continuing', err)
  }

  // 6. Step sync engine — created after backup/driveSync (see below) so collaborators can be injected.

  // 6a. Engines + views (wired after db is ready)
  const goal = createGoal(db)
  const streak = createStreak(db, goal)
  const streakUI = createStreakUI(doc, streak, reporter)
  const calendar = createCalendar(db, goal)
  const records = createRecords(db)
  const monthOverview = createMonthOverview(doc, calendar, reporter)
  const search = createSearch(db)
  const exporter = createExporter(fileSaver)
  const searchUI = createSearchUI(doc, search, exporter, reporter, computeNearMisses, records, processImage)
  const calendarUI = createCalendarUI(doc, db, calendar, reporter, records, processImage, monthOverview)
  const weekUI = createCalendarWeekUI(doc, createWeek(db, goal), reporter, {
    onDayClick: (day) => calendarUI.openDay(day),
  })
  const challenge = createChallenge(db)
  const challengeUI = createChallengeUI(doc, challenge, db, reporter, { share: selectShare({ isNative }) })
  const settings = createSettings(db)
  const settingsUI = createSettingsUI(doc, settings, reporter, createConfirmAdapter(window))

  // Insights (analytics) and Journey (gamification + odyssey)
  const proofLightbox = createProofLightbox(doc)
  const analyticsEngine = createAnalytics(db)
  const analyticsUI = createAnalyticsUI(doc, analyticsEngine, reporter, proofLightbox)
  const gamificationEngine = createGamification(db)
  const gamificationUI = createGamificationUI(doc, gamificationEngine, reporter)
  const odysseyUI = createOdysseyUI(doc, { computeOdysseyProgress }, analyticsEngine, reporter)

  // Redefine the #db-status badge to account for Drive Cloud Auto-Sync state
  // now that settings is available (fail-open — a read error leaves whatever
  // requestPersistentStorage already wrote in place).
  try {
    await refreshStorageProtectionBadge(reporter, settings, storageManager)
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
    backupUI = createBackupUI(doc, backup, reporter, createConfirmAdapter(window), settings, fileSaver)
  } catch (err) {
    console.error('[main] createBackupUI failed, continuing', err)
  }

  // ST-012: Drive sync gateway + UI (fail-open)
  let driveSync = null
  let driveSyncUI = null
  try {
    // ST-026: in the app, each Drive request gets a current token from Play
    // services (a token cached at launch expires after an hour).
    const getDriveToken = auth.getFreshAccessToken
      ? () => auth.getFreshAccessToken()
      : () => auth.getAccessToken()
    driveSync = createDriveSync({ getAccessToken: getDriveToken, reporter, fetchFn: fetch.bind(window), validator: _validateEnvelope })
  } catch (err) {
    console.error('[main] createDriveSync failed, continuing', err)
  }
  // ST-020: only the primary device uploads to Drive automatically; every
  // other installation asks before replacing its backup. Fail-open: without
  // it, uploads behave as before.
  let primaryDevice = null
  try {
    primaryDevice = createPrimaryDevice({
      settings,
      driveSync,
      storage,
      label: isNative ? 'Android app' : 'Web browser',
    })
  } catch (err) {
    console.error('[main] createPrimaryDevice failed, continuing', err)
  }
  // ST-020: in the app, Google sign-in (for Drive) lives in the Drive panel —
  // the Settings connect button is Health Connect's. In the browser that
  // button already covers Google.
  const driveConnection = isNative ? createGoogleDriveConnection({ auth, storage }) : null
  try {
    driveSyncUI = createDriveSyncUI(doc, driveSync, backup, reporter, createConfirmAdapter(window), settings, storageManager, {
      primaryDevice,
      driveConnection,
      canMakePrimary: isNative,
    })
  } catch (err) {
    console.error('[main] createDriveSyncUI failed, continuing', err)
  }

  // Storage protection panel (fail-open) — a plain status panel + direct-action button.
  let storageHealthUI = null
  try {
    storageHealthUI = createStorageHealthUI(doc, settings, reporter, storageManager, { appStorage: isNative })
  } catch (err) {
    console.error('[main] createStorageHealthUI failed, continuing', err)
  }

  // ST-013: Service Worker registration (fail-open; PROD-gated inside the
  // factory — the dev server must never register a SW over Vite HMR assets).
  // ST-017: never inside the Android app, whose assets ship in the APK — a
  // service worker there would keep serving the previous version's files.
  // Fire-and-forget: bootstrap does not block on worker install; the factory
  // never rejects, but a .catch() guards against unexpected async rejection.
  try {
    createSwRegister({ nav: navigator, config: { prod: import.meta.env.PROD && !isNative } })
      .register()
      .catch((err) => console.error('[main] SW registration failed, continuing', err))
  } catch (err) {
    console.error('[main] SW registration failed, continuing', err)
  }

  // 6b. Step sync engine — wired here so driveSync + backup are available as injected collaborators
  // ST-019: Google Fit in the browser, Health Connect in the Android app.
  const { source: stepSource, connection } = selectStepSource({
    isNative,
    auth,
    reporter,
    storage,
    health: Health,
    launcher: AppLauncher,
  })
  const stepSync = createStepSync(stepSource, db, reporter, doc, driveSync, backup, settings, primaryDevice)

  // Backup & restore screen: the three panels mount into their own
  // containers so no render clears another's output (each render() wipes its
  // container first). Wrapped as views so the shared refresh helper can render them.
  const backupControls = doc.getElementById('backup-controls')
  const cloudControls = doc.getElementById('cloud-controls')
  const storageHealthControls = doc.getElementById('storage-health-controls')
  const backupView = { render: () => backupControls && backupUI?.render?.(backupControls) }
  const cloudView = { render: () => cloudControls && driveSyncUI?.render?.(cloudControls) }
  const storageHealthView = { render: () => storageHealthControls && storageHealthUI?.render?.(storageHealthControls) }
  await _renderViews([['backupUI', backupView], ['driveSyncUI', cloudView], ['storageHealthUI', storageHealthView]])

  // The Storage protection panel and the cloud-sync toggle live in separate
  // modules/mount points; drive-sync-ui.js dispatches these events rather
  // than holding a direct reference.
  doc.addEventListener('data:storage-health:refresh', () =>
    _renderViews([['storageHealthUI', storageHealthView]], 'refresh event'))
  doc.addEventListener('data:drive-sync:refresh', () =>
    _renderViews([['driveSyncUI', cloudView]], 'refresh event'))

  // A goal change re-scores streaks and the calendar.
  const progressUI = createProgressUI(doc, goal, db, reporter, () =>
    _renderViews([['streakUI', streakUI], ['calendarUI', calendarUI], ['weekUI', weekUI]], 'goal change'))

  // Views that show step data, in screen order; re-rendered after every sync.
  const dataViews = () => [
    ['progressUI', progressUI],
    ['streakUI', streakUI],
    ['calendarUI', calendarUI],
    ['weekUI', weekUI],
    ['challengeUI', challengeUI],
    ['analyticsUI', analyticsUI],
    ['gamificationUI', gamificationUI],
    ['odysseyUI', odysseyUI],
  ]

  // 7. Connect button (Settings › Connections): Google sign-in in the
  // browser, Health Connect access in the Android app (the platform
  // connection decides). Connect is a storage-protection-relevant user
  // gesture: silently request persistence alongside it (fire-and-forget).
  const sourceName = isNative ? 'Health Connect' : 'Google Fit'
  const sourceNameEl = doc.getElementById('step-source-name')
  if (sourceNameEl) sourceNameEl.textContent = sourceName
  const authBtn = doc.getElementById('auth-btn')
  if (authBtn) {
    authBtn.textContent = connection.label
    authBtn.addEventListener('click', () => {
      Promise.resolve(connection.connect()).catch((err) => {
        console.error('[main] connect failed, continuing', err)
      })
      requestSilentPersistAndRefreshBadge(reporter, settings, storageManager).catch((err) => {
        console.error('[main] requestSilentPersistAndRefreshBadge failed, continuing', err)
      })
    })
  }

  // 7a. Shared post-sync re-render pipeline (SF-12: re-render after each sync).
  // Every sync goes through `syncTrigger` (below) so the app knows when it
  // last synced — the sync button, pull-to-refresh, the auto-sync-on-connect
  // hook and the resume hook converge on the same refresh.
  const runSyncPipeline = async () => {
    await stepSync.sync()
    await _renderViews(dataViews(), 'sync')
    try {
      await _renderLastSyncLabel(db, doc)
    } catch (err) {
      console.error('[main] last-sync label update failed, continuing', err)
    }
  }

  const syncTrigger = createSyncTrigger({
    sync: runSyncPipeline,
    canSync: () => stepSync.canSync(),
  })

  // 7'. Navigation: bottom tabs, pushed screens, the app-bar back arrow and
  // the Android back button. Settings loads its stored values each time it opens.
  const screens = createNavigator(doc, {
    onEnter: {
      settings: () => {
        Promise.resolve(settingsUI.open()).catch((err) => console.error('[main] settingsUI.open failed, continuing', err))
      },
    },
  })
  screens.bind()
  onBackButton({ isNative }, () => screens.back())

  // 7''. First launch: a welcome screen until the user connects, restores a
  // backup or skips. The connection keeps one onConnected listener, so this
  // hook both closes the welcome screen and syncs.
  const onboarding = createOnboardingUI(doc, {
    storage,
    connection,
    sourceName,
    hasData: async () => (await db.daily_records.count()) > 0,
    onRestore: () => screens.go('backup'),
  })

  // 7b. Auto-sync the moment a connection succeeds — from the first connect
  // click or a silent restore at startup — so the user never has to sync twice.
  connection.onConnected(() => {
    onboarding.dismiss()
    return syncTrigger.run()
  })

  // 7b'. ST-021: sync again when the app comes back to the foreground (Android
  // keeps the app in memory, so reopening it is a resume, not a fresh start;
  // a browser tab counts when it becomes visible). Throttled by a cooldown and
  // silent when the source is not connected.
  onAppResume({ isNative, doc }, () => {
    syncTrigger.runIfStale()
  })

  // 7c. Restore the connection at startup without UI: a silent Google token
  // when the user connected before (web), or Health Connect access that was
  // already granted (Android). 7b then auto-syncs. Fire-and-forget: startup
  // never waits on it.
  Promise.resolve(connection.restore()).catch((err) => {
    console.error('[main] connection restore failed, continuing', err)
  })

  // 7d. Android app: Google Drive connects from the Drive panel and restores
  // silently at launch; either way the panel re-renders to show it.
  if (driveConnection) {
    driveConnection.onConnected(() => {
      doc.dispatchEvent(new (doc.defaultView?.CustomEvent ?? CustomEvent)('data:drive-sync:refresh'))
    })
    Promise.resolve(driveConnection.restore()).catch((err) => {
      console.error('[main] Google Drive restore failed, continuing', err)
    })
  }

  // 8. Settings screen: its data panel is built once; the version line below it.
  try {
    await settingsUI.render()
  } catch (err) {
    console.error('[main] settingsUI.render failed, continuing', err)
  }
  const versionEl = doc.getElementById('app-version')
  if (versionEl && APP_VERSION) versionEl.textContent = `Step Tracker v${APP_VERSION}`

  // 8. Sync: the button in Today's status line and pull-to-refresh. Syncing
  // is a storage-protection-relevant user gesture: silently request
  // navigator.storage.persist() alongside it (fire-and-forget).
  const requestSync = () => {
    requestSilentPersistAndRefreshBadge(reporter, settings, storageManager).catch((err) => {
      console.error('[main] requestSilentPersistAndRefreshBadge failed, continuing', err)
    })
    return syncTrigger.run()
  }
  doc.getElementById('sync-btn')?.addEventListener('click', () => { requestSync() })
  const ptrIndicator = doc.getElementById('ptr-indicator')
  if (ptrIndicator) {
    createPullToRefresh(doc, {
      indicator: ptrIndicator,
      onRefresh: requestSync,
      isEnabled: () => screens.current() === 'today' && !onboarding.isOpen(),
    })
  }

  // 8a. A record changed (day override, revert, prune, wipe, restore, home
  // city): refresh every view that shows records (fail-open).
  doc.addEventListener('data:records:mutated', () =>
    _renderViews([
      ...dataViews(),
      ['searchUI', searchUI],
      ['backupUI', backupView],
      ['driveSyncUI', cloudView],
    ], 'mutation'))

  // 8b. Populate Today's "Sync: …" label from the newest record (fail-open)
  try {
    await _renderLastSyncLabel(db, doc)
  } catch (err) {
    console.error('[main] last-sync label update failed, continuing', err)
  }

  // 9. Calendar Week / Month switch — the week renders when first shown.
  initCalendarViewSwitch(doc, {
    onChange: (view) => {
      if (view === 'week') _renderViews([['weekUI', weekUI]])
    },
  })

  // 9a. #db-status pill: when it reads "Backup Disabled" (unbacked-up state),
  // tapping it opens Backup & restore; otherwise it is informational.
  const dbStatusEl = doc.getElementById('db-status')
  if (dbStatusEl) {
    dbStatusEl.addEventListener('click', () => {
      if (dbStatusEl.textContent === BACKUP_DISABLED_TEXT) {
        screens.go('backup')
      }
    })
  }

  // 10. First render of every screen (fail-open), then the welcome screen.
  await _renderViews([...dataViews(), ['searchUI', searchUI]])
  try {
    await onboarding.start()
  } catch (err) {
    console.error('[main] onboarding.start failed, continuing', err)
  }
}

// Register the bootstrap listener when running as the real app entry point.
// In tests, DOMContentLoaded is dispatched manually after mocks are configured.
if (typeof import.meta !== 'undefined' && import.meta.env?.MODE !== 'test') {
  document.addEventListener('DOMContentLoaded', () => bootstrap());
}
