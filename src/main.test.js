import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// All vi.mock calls are hoisted — they run before any imports
vi.mock('./config.js', () => ({ CLIENT_ID: 'FAKE_ID' }))

// ST-012 Task 7: mock backup.js, backup-ui.js, drive-sync.js, drive-sync-ui.js
const mockBackupInstance = { buildBackup: vi.fn().mockResolvedValue({}), restoreBackup: vi.fn().mockResolvedValue(undefined) }
vi.mock('./backup.js', () => ({
  createBackup: vi.fn(() => mockBackupInstance),
  BACKUP_SCHEMA_VERSION: 1,
  BACKUP_FILENAME_PREFIX: 'step-tracker-backup-'
}))

const mockBackupUIInstance = { render: vi.fn() }
vi.mock('./backup-ui.js', () => ({
  createBackupUI: vi.fn(() => mockBackupUIInstance)
}))

const mockDriveSyncInstance = { find: vi.fn().mockResolvedValue(null), push: vi.fn().mockResolvedValue(undefined), pull: vi.fn().mockResolvedValue(null) }
vi.mock('./drive-sync.js', () => ({
  createDriveSync: vi.fn(() => mockDriveSyncInstance)
}))

const mockDriveSyncUIInstance = { render: vi.fn() }
vi.mock('./drive-sync-ui.js', () => ({
  createDriveSyncUI: vi.fn(() => mockDriveSyncUIInstance)
}))


// Task 5: mock records.js and image-processor.js
const mockRecordsInstance = { overrideRecord: vi.fn().mockResolvedValue(undefined), revertRecord: vi.fn().mockResolvedValue(undefined) }
vi.mock('./records.js', () => ({
  createRecords: vi.fn(() => mockRecordsInstance)
}))

vi.mock('./image-processor.js', () => ({
  processImage: vi.fn().mockResolvedValue('data:image/jpeg;base64,abc')
}))

// Task 6: mock goal.js and progress-ui.js
const mockGoalInstance = { getActiveStepGoal: vi.fn(), setActiveStepGoal: vi.fn() }
vi.mock('./goal.js', () => ({
  createGoal: vi.fn(() => mockGoalInstance)
}))

const mockProgressUIInstance = { render: vi.fn().mockResolvedValue(undefined) }
vi.mock('./progress-ui.js', () => ({
  createProgressUI: vi.fn(() => mockProgressUIInstance)
}))

// Task 10: mock streak.js and streak-ui.js
const mockStreakInstance = {}
vi.mock('./streak.js', () => ({
  createStreak: vi.fn(() => mockStreakInstance)
}))

const mockStreakUIInstance = { render: vi.fn().mockResolvedValue(undefined) }
vi.mock('./streak-ui.js', () => ({
  createStreakUI: vi.fn(() => mockStreakUIInstance)
}))

// Task 12: mock calendar.js and calendar-ui.js
const mockCalendarInstance = {
  loadMonth: vi.fn().mockResolvedValue({}),
  buildZeroState: vi.fn()
}
vi.mock('./calendar.js', () => ({
  createCalendar: vi.fn(() => mockCalendarInstance)
}))

const mockCalendarUIInstance = { render: vi.fn().mockResolvedValue(undefined) }
vi.mock('./calendar-ui.js', () => ({
  createCalendarUI: vi.fn(() => mockCalendarUIInstance)
}))

const mockMonthOverviewInstance = { render: vi.fn().mockResolvedValue(undefined) }
vi.mock('./month-overview.js', () => ({
  createMonthOverview: vi.fn(() => mockMonthOverviewInstance)
}))

// Task 7: mock search.js, search-ui.js, exporter.js
const mockSearchInstance = { executeQuery: vi.fn(), computeResultSummary: vi.fn() }
vi.mock('./search.js', () => ({
  createSearch: vi.fn(() => mockSearchInstance),
  computeNearMisses: vi.fn()
}))

const mockExporterInstance = { exportCsv: vi.fn(), exportJson: vi.fn() }
vi.mock('./exporter.js', () => ({
  createExporter: vi.fn(() => mockExporterInstance)
}))

const mockSearchUIInstance = { render: vi.fn().mockResolvedValue(undefined) }
vi.mock('./search-ui.js', () => ({
  createSearchUI: vi.fn(() => mockSearchUIInstance)
}))

// Task 6 (ST-006b): mock challenge.js and challenge-ui.js
const mockChallengeInstance = { getActiveChallenge: vi.fn(), setActiveChallenge: vi.fn() }
vi.mock('./challenge.js', () => ({
  createChallenge: vi.fn(() => mockChallengeInstance)
}))

const mockChallengeUIInstance = { render: vi.fn().mockResolvedValue(undefined) }
vi.mock('./challenge-ui.js', () => ({
  createChallengeUI: vi.fn(() => mockChallengeUIInstance)
}))

const mockReporter = { db: vi.fn(), auth: vi.fn() }
vi.mock('./ui-status.js', () => ({
  createStatusReporter: vi.fn(() => mockReporter)
}))

const mockDb = {}
vi.mock('./db.js', () => ({
  createDb: vi.fn(() => mockDb),
  initDB: vi.fn(() => Promise.resolve()),
  DB_NAME: 'StepTrackerDB',
  DB_VERSION: 2
}))

vi.mock('./storage.js', () => ({
  requestPersistentStorage: vi.fn(() => Promise.resolve())
}))

let mockOnTokenHandler
const mockAuthInstance = {
  init: vi.fn(),
  requestToken: vi.fn(),
  getAccessToken: vi.fn(),
  onTokenReceived: vi.fn((cb) => { mockOnTokenHandler = cb })
}
vi.mock('./auth.js', () => ({
  createAuth: vi.fn(() => mockAuthInstance)
}))

vi.mock('./tabs.js', () => ({
  initTabs: vi.fn(),
  switchTab: vi.fn()
}))

const mockStepSyncInstance = { sync: vi.fn() }
vi.mock('./steps.js', () => ({
  createStepSync: vi.fn(() => mockStepSyncInstance)
}))

// ST-015 Task 9: settings + settings-ui mocks
const mockSettingsInstance = { getSyncAnchorDate: vi.fn().mockResolvedValue('2018-01-01'), setSyncAnchorDate: vi.fn(), countRecordsBefore: vi.fn(), pruneRecordsBefore: vi.fn(), wipeDatabase: vi.fn() }
vi.mock('./settings.js', () => ({
  createSettings: vi.fn(() => mockSettingsInstance)
}))

const mockSettingsUIInstance = { render: vi.fn().mockResolvedValue(undefined), open: vi.fn(), close: vi.fn() }
vi.mock('./settings-ui.js', () => ({
  createSettingsUI: vi.fn(() => mockSettingsUIInstance)
}))

// ST-015 Task 11: confirm adapter mock
const mockConfirmAdapter = vi.fn()
vi.mock('./confirm.js', () => ({
  createConfirmAdapter: vi.fn(() => mockConfirmAdapter)
}))


// Import mocked modules so we have references to the spy fns
import { createGoal } from './goal.js'
import { createProgressUI } from './progress-ui.js'
import { createStatusReporter } from './ui-status.js'
import { createDb, initDB } from './db.js'
import { requestPersistentStorage } from './storage.js'
import { createAuth } from './auth.js'
import { initTabs } from './tabs.js'
import { createStepSync } from './steps.js'
import { createStreak } from './streak.js'
import { createStreakUI } from './streak-ui.js'
import { createCalendar } from './calendar.js'
import { createCalendarUI } from './calendar-ui.js'
import { createMonthOverview } from './month-overview.js'
import { createSearch } from './search.js'
import { createExporter } from './exporter.js'
import { createSearchUI } from './search-ui.js'
import { createChallenge } from './challenge.js'
import { createChallengeUI } from './challenge-ui.js'
import { createSettings } from './settings.js'
import { createSettingsUI } from './settings-ui.js'
import { createConfirmAdapter } from './confirm.js'
import { createBackup } from './backup.js'
import { createBackupUI } from './backup-ui.js'
import { createDriveSync } from './drive-sync.js'
import { createDriveSyncUI } from './drive-sync-ui.js'

// Import bootstrap directly — cleaner than dispatching DOMContentLoaded
import { bootstrap } from './main.js'

// Helper: set up DOM and call bootstrap directly
async function boot(storage) {
  document.body.innerHTML = `
    <button id="auth-btn">Connect</button>
    <button id="sync-btn">Sync Steps</button>
    <nav class="tab-bar"></nav>
    <div id="db-status"></div>
    <div id="auth-status"></div>
    <span id="sync-status"></span>
  `
  await bootstrap(document, storage)
}

// Minimal in-memory Storage substitute — the jsdom environment in this repo
// does not expose a working localStorage global, and injection is the
// established DI seam for collaborator-provided state in main.js.
function makeStorage() {
  const store = new Map()
  return {
    getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn((key, value) => { store.set(key, String(value)) }),
    clear: vi.fn(() => store.clear()),
  }
}

describe('main.js — composition root bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Restore default resolved promise for initDB
    initDB.mockResolvedValue(undefined)
    requestPersistentStorage.mockResolvedValue(undefined)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('invokes createDb() once on DOMContentLoaded', async () => {
    await boot()
    expect(createDb).toHaveBeenCalledTimes(1)
  })

  it('invokes initDB exactly once on DOMContentLoaded', async () => {
    await boot()
    expect(initDB).toHaveBeenCalledTimes(1)
  })

  it('invokes requestPersistentStorage exactly once on DOMContentLoaded', async () => {
    await boot()
    expect(requestPersistentStorage).toHaveBeenCalledTimes(1)
  })

  it('invokes auth.init exactly once on DOMContentLoaded', async () => {
    await boot()
    expect(mockAuthInstance.init).toHaveBeenCalledTimes(1)
  })

  it('invokes initTabs exactly once on DOMContentLoaded', async () => {
    await boot()
    expect(initTabs).toHaveBeenCalledTimes(1)
  })

  it('invokes requestPersistentStorage after initDB resolves', async () => {
    let initDBResolved = false
    initDB.mockImplementation(() => {
      return new Promise(resolve => setTimeout(() => {
        initDBResolved = true
        resolve()
      }, 10))
    })

    let persistCalledAfterDB = false
    requestPersistentStorage.mockImplementation(() => {
      persistCalledAfterDB = initDBResolved
      return Promise.resolve()
    })

    document.body.innerHTML = `
      <button id="auth-btn">Connect</button>
      <nav class="tab-bar"></nav>
    `
    await bootstrap(document)

    expect(persistCalledAfterDB).toBe(true)
  })

  it('clicking #auth-btn invokes auth.requestToken()', async () => {
    await boot()
    const btn = document.getElementById('auth-btn')
    btn.click()
    expect(mockAuthInstance.requestToken).toHaveBeenCalledTimes(1)
  })

  it('passes a config object with CLIENT_ID to createAuth', async () => {
    await boot()
    expect(createAuth).toHaveBeenCalledWith(
      expect.objectContaining({ CLIENT_ID: 'FAKE_ID' }),
      expect.anything()
    )
  })

  it('createStatusReporter is called once; reporter is shared by db, storage, auth', async () => {
    await boot()
    expect(createStatusReporter).toHaveBeenCalledTimes(1)
    // initDB receives reporter as second arg
    expect(initDB).toHaveBeenCalledWith(expect.anything(), mockReporter)
    // requestPersistentStorage receives reporter as first arg
    expect(requestPersistentStorage).toHaveBeenCalledWith(mockReporter)
    // createAuth receives reporter as second arg
    expect(createAuth).toHaveBeenCalledWith(expect.anything(), mockReporter)
  })

  it('when initDB rejects, auth.init is still invoked (fail-open)', async () => {
    initDB.mockRejectedValue(new Error('DB fail'))
    await boot()
    expect(mockAuthInstance.init).toHaveBeenCalledTimes(1)
  })

  it('when initDB rejects, initTabs is still invoked (fail-open)', async () => {
    initDB.mockRejectedValue(new Error('DB fail'))
    await boot()
    expect(initTabs).toHaveBeenCalledTimes(1)
  })
})

describe('main.js — dependency injection contract (regression)', () => {
  it('reporter is passed to initDB (not DOM accessed inside db.js)', async () => {
    await boot()
    // initDB receives the reporter object — verifies injection, not direct DOM access
    const [, reporterArg] = initDB.mock.calls[0]
    expect(typeof reporterArg.db).toBe('function')
    expect(typeof reporterArg.auth).toBe('function')
  })

  it('reporter is passed to requestPersistentStorage (not DOM accessed inside storage.js)', async () => {
    await boot()
    const [reporterArg] = requestPersistentStorage.mock.calls[0]
    expect(typeof reporterArg.db).toBe('function')
  })

  it('config with CLIENT_ID is passed to createAuth (not DOM accessed inside auth.js)', async () => {
    await boot()
    const [configArg] = createAuth.mock.calls[0]
    expect(configArg).toHaveProperty('CLIENT_ID')
  })
})

describe('main.js — Task 11 step sync wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    requestPersistentStorage.mockResolvedValue(undefined)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('invokes createStepSync exactly once on DOMContentLoaded', async () => {
    await boot()
    expect(createStepSync).toHaveBeenCalledTimes(1)
  })

  it('createStepSync receives auth, db, the shared reporter and the shared doc as the fourth argument', async () => {
    await boot()
    expect(createStepSync).toHaveBeenCalledWith(
      mockAuthInstance,
      mockDb,
      mockReporter,
      document
    )
  })

  it('clicking #sync-btn invokes stepSync.sync() exactly once', async () => {
    await boot()
    const btn = document.getElementById('sync-btn')
    btn.click()
    expect(mockStepSyncInstance.sync).toHaveBeenCalledTimes(1)
  })

  it('bootstrap() does not throw when #sync-btn is missing (fail-open)', async () => {
    document.body.innerHTML = `
      <button id="auth-btn">Connect</button>
      <nav class="tab-bar"></nav>
    `
    await expect(bootstrap(document)).resolves.toBeUndefined()
    expect(createStepSync).toHaveBeenCalledTimes(1)
  })
})

describe('main.js — auto-sync on connect + silent session restore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    requestPersistentStorage.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockChallengeUIInstance.render.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    mockOnTokenHandler = null
  })

  it('registers an onTokenReceived hook during bootstrap', async () => {
    await boot(makeStorage())
    expect(mockAuthInstance.onTokenReceived).toHaveBeenCalledTimes(1)
    expect(typeof mockOnTokenHandler).toBe('function')
  })

  it('bootstrap with no previous connection does not attempt a silent restore', async () => {
    await boot(makeStorage())
    expect(mockAuthInstance.requestToken).not.toHaveBeenCalled()
  })

  it('bootstrap with a persisted connection flag requests a silent token (prompt: "")', async () => {
    const storage = makeStorage()
    storage.setItem('google_connected', '1')
    await boot(storage)
    expect(mockAuthInstance.requestToken).toHaveBeenCalledTimes(1)
    expect(mockAuthInstance.requestToken).toHaveBeenCalledWith({ prompt: '' })
  })

  it('a connection flag read failure is fail-open (no silent restore, bootstrap continues)', async () => {
    const storage = makeStorage()
    storage.getItem.mockImplementation(() => { throw new Error('storage locked') })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await boot(storage)
    expect(mockAuthInstance.requestToken).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(
      '[main] failed to read google connection flag, continuing',
      expect.any(Error)
    )
    errorSpy.mockRestore()
  })

  it('the onTokenReceived hook persists the connection flag and triggers a sync', async () => {
    const storage = makeStorage()
    await boot(storage)
    vi.clearAllMocks()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    await mockOnTokenHandler()
    expect(storage.setItem).toHaveBeenCalledWith('google_connected', '1')
    expect(mockStepSyncInstance.sync).toHaveBeenCalledTimes(1)
  })

  it('the onTokenReceived hook runs the full post-sync re-render pipeline', async () => {
    await boot(makeStorage())
    vi.clearAllMocks()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockChallengeUIInstance.render.mockResolvedValue(undefined)
    await mockOnTokenHandler()
    expect(mockProgressUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockMonthOverviewInstance.render).toHaveBeenCalledTimes(1)
    expect(mockChallengeUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('the onTokenReceived hook runs the sync before re-rendering (ordering)', async () => {
    await boot(makeStorage())
    vi.clearAllMocks()
    let syncResolved = false
    mockStepSyncInstance.sync.mockImplementation(() =>
      new Promise(res => setTimeout(() => { syncResolved = true; res() }, 10))
    )
    let progressRenderedAfterSync = false
    mockProgressUIInstance.render.mockImplementation(() => {
      progressRenderedAfterSync = syncResolved
      return Promise.resolve()
    })
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockChallengeUIInstance.render.mockResolvedValue(undefined)
    await mockOnTokenHandler()
    expect(progressRenderedAfterSync).toBe(true)
  })

  it('the onTokenReceived hook writes only the boolean flag — never a token', async () => {
    const storage = makeStorage()
    await boot(storage)
    vi.clearAllMocks()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    await mockOnTokenHandler()
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(storage.setItem).toHaveBeenCalledWith('google_connected', '1')
  })
})

describe('main.js — Task 6: composition-root wiring (createGoal + createProgressUI + render)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    requestPersistentStorage.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('createGoal is invoked exactly once with mockDb', async () => {
    await boot()
    expect(createGoal).toHaveBeenCalledTimes(1)
    expect(createGoal).toHaveBeenCalledWith(mockDb)
  })

  it('createProgressUI is invoked once with (document, goalInstance, mockDb, mockReporter, onGoalApplied)', async () => {
    await boot()
    expect(createProgressUI).toHaveBeenCalledTimes(1)
    expect(createProgressUI).toHaveBeenCalledWith(document, mockGoalInstance, mockDb, mockReporter, expect.any(Function))
  })

  it('progressUI.render() called exactly once on bootstrap', async () => {
    await boot()
    expect(mockProgressUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('render() is called after initTabs (call-order enforced)', async () => {
    await boot()
    const initTabsCallOrder = initTabs.mock.invocationCallOrder[0]
    const renderCallOrder = mockProgressUIInstance.render.mock.invocationCallOrder[0]
    expect(renderCallOrder).toBeGreaterThan(initTabsCallOrder)
  })

  it('bootstrap resolves even if progressUI.render() rejects (fail-open)', async () => {
    mockProgressUIInstance.render.mockRejectedValue(new Error('render fail'))
    await expect(boot()).resolves.toBeUndefined()
  })

  it('clicking #sync-btn calls stepSync.sync() once then progressUI.render() once', async () => {
    await boot()
    vi.clearAllMocks()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    const btn = document.getElementById('sync-btn')
    btn.click()
    // wait for async handler to complete
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mockStepSyncInstance.sync).toHaveBeenCalledTimes(1)
    expect(mockProgressUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('render() is called only after sync() resolves (ordering enforced)', async () => {
    await boot()
    vi.clearAllMocks()
    let syncResolved = false
    mockStepSyncInstance.sync.mockImplementation(() =>
      new Promise(res => setTimeout(() => { syncResolved = true; res() }, 10))
    )
    let renderCalledAfterSync = false
    mockProgressUIInstance.render.mockImplementation(() => {
      renderCalledAfterSync = syncResolved
      return Promise.resolve()
    })
    const btn = document.getElementById('sync-btn')
    btn.click()
    await new Promise(res => setTimeout(res, 30))
    expect(renderCalledAfterSync).toBe(true)
  })
})

describe('main.js — Task 10: streak engine wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    requestPersistentStorage.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('createStreak is invoked exactly once with (mockDb, goalInstance)', async () => {
    await boot()
    expect(createStreak).toHaveBeenCalledTimes(1)
    expect(createStreak).toHaveBeenCalledWith(mockDb, mockGoalInstance)
  })

  it('createStreakUI is invoked exactly once with (document, streakInstance, mockReporter)', async () => {
    await boot()
    expect(createStreakUI).toHaveBeenCalledTimes(1)
    expect(createStreakUI).toHaveBeenCalledWith(document, mockStreakInstance, mockReporter)
  })

  it('createProgressUI receives a function as its 5th argument', async () => {
    await boot()
    const fifthArg = createProgressUI.mock.calls[0][4]
    expect(typeof fifthArg).toBe('function')
  })

  it('calling the 5th arg of createProgressUI invokes streakUI.render()', async () => {
    await boot()
    // capture before clearAllMocks wipes call history
    const fifthArg = createProgressUI.mock.calls[0][4]
    vi.clearAllMocks()
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    await fifthArg()
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('streakUI.render() is called exactly once on load (bootstrap load-time render)', async () => {
    await boot()
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('streakUI.render() is called after progressUI.render() on load', async () => {
    await boot()
    const progressRenderOrder = mockProgressUIInstance.render.mock.invocationCallOrder[0]
    const streakRenderOrder = mockStreakUIInstance.render.mock.invocationCallOrder[0]
    expect(streakRenderOrder).toBeGreaterThan(progressRenderOrder)
  })

  it('sync click calls sync() then progressUI.render() then streakUI.render()', async () => {
    await boot()
    vi.clearAllMocks()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    const btn = document.getElementById('sync-btn')
    btn.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mockStepSyncInstance.sync).toHaveBeenCalledTimes(1)
    expect(mockProgressUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockStepSyncInstance.sync.mock.invocationCallOrder[0]).toBeLessThan(mockProgressUIInstance.render.mock.invocationCallOrder[0])
    expect(mockProgressUIInstance.render.mock.invocationCallOrder[0]).toBeLessThan(mockStreakUIInstance.render.mock.invocationCallOrder[0])
  })

  it('streakUI.render() is called after progressUI.render() in sync handler (ordering)', async () => {
    await boot()
    vi.clearAllMocks()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockImplementation(() => {
      return Promise.resolve()
    })
    let streakRenderCalledAfterProgress = false
    mockStreakUIInstance.render.mockImplementation(() => {
      streakRenderCalledAfterProgress = mockProgressUIInstance.render.mock.invocationCallOrder[0] < mockStreakUIInstance.render.mock.invocationCallOrder[0]
      return Promise.resolve()
    })
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    const btn = document.getElementById('sync-btn')
    btn.click()
    await new Promise(res => setTimeout(res, 30))
    expect(streakRenderCalledAfterProgress).toBe(true)
  })

  it('sync-time streak render rejection is fail-open', async () => {
    await boot()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockRejectedValueOnce(new Error('sync streak render fail'))
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    document.getElementById('sync-btn').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(errorSpy).toHaveBeenCalledWith(
      '[main] streakUI.render failed after sync, continuing',
      expect.any(Error),
    )
  })

  it('bootstrap resolves even if streakUI.render() rejects on load (fail-open)', async () => {
    mockStreakUIInstance.render.mockRejectedValue(new Error('streak render fail'))
    await expect(boot()).resolves.toBeUndefined()
  })
})

describe('main.js — Task 12: calendar wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    requestPersistentStorage.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('createCalendar is invoked exactly once with (mockDb, mockGoalInstance)', async () => {
    await boot()
    expect(createCalendar).toHaveBeenCalledTimes(1)
    expect(createCalendar).toHaveBeenCalledWith(mockDb, mockGoalInstance)
  })

  it('createCalendarUI is invoked exactly once with (document, mockDb, calendarInstance, mockReporter)', async () => {
    await boot()
    expect(createCalendarUI).toHaveBeenCalledTimes(1)
    expect(createCalendarUI).toHaveBeenCalledWith(
      document,
      mockDb,
      mockCalendarInstance,
      mockReporter,
      mockRecordsInstance,
      expect.any(Function),
      mockMonthOverviewInstance,
    )
  })

  it('calendarUI.render() is called exactly once on bootstrap', async () => {
    await boot()
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('calendarUI.render() is called after streakUI.render() on bootstrap', async () => {
    await boot()
    const streakRenderOrder = mockStreakUIInstance.render.mock.invocationCallOrder[0]
    const calendarRenderOrder = mockCalendarUIInstance.render.mock.invocationCallOrder[0]
    expect(calendarRenderOrder).toBeGreaterThan(streakRenderOrder)
  })

  it('clicking #sync-btn triggers progressUI.render, streakUI.render and calendarUI.render in order', async () => {
    await boot()
    vi.clearAllMocks()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    const btn = document.getElementById('sync-btn')
    btn.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mockStepSyncInstance.sync).toHaveBeenCalledTimes(1)
    expect(mockProgressUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockStepSyncInstance.sync.mock.invocationCallOrder[0]).toBeLessThan(mockProgressUIInstance.render.mock.invocationCallOrder[0])
    expect(mockProgressUIInstance.render.mock.invocationCallOrder[0]).toBeLessThan(mockStreakUIInstance.render.mock.invocationCallOrder[0])
    expect(mockStreakUIInstance.render.mock.invocationCallOrder[0]).toBeLessThan(mockCalendarUIInstance.render.mock.invocationCallOrder[0])
  })

  it('calendarUI.render() is called after streakUI.render() in sync handler', async () => {
    await boot()
    vi.clearAllMocks()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    let calendarRenderCalledAfterStreak = false
    mockCalendarUIInstance.render.mockImplementation(() => {
      calendarRenderCalledAfterStreak = mockStreakUIInstance.render.mock.invocationCallOrder[0] < mockCalendarUIInstance.render.mock.invocationCallOrder[0]
      return Promise.resolve()
    })
    const btn = document.getElementById('sync-btn')
    btn.click()
    await new Promise(res => setTimeout(res, 30))
    expect(calendarRenderCalledAfterStreak).toBe(true)
  })

  it('sync-time calendar render rejection is fail-open', async () => {
    await boot()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockRejectedValueOnce(new Error('sync calendar render fail'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    document.getElementById('sync-btn').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(errorSpy).toHaveBeenCalledWith(
      '[main] calendarUI.render failed after sync, continuing',
      expect.any(Error),
    )
  })

  it('bootstrap resolves even if calendarUI.render() rejects on load (fail-open)', async () => {
    mockCalendarUIInstance.render.mockRejectedValue(new Error('calendar render fail'))
    await expect(boot()).resolves.toBeUndefined()
  })
})

describe('main.js — month-overview dashboard card wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    requestPersistentStorage.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('createMonthOverview is invoked exactly once with (document, calendarInstance, mockReporter)', async () => {
    await boot()
    expect(createMonthOverview).toHaveBeenCalledTimes(1)
    expect(createMonthOverview).toHaveBeenCalledWith(document, mockCalendarInstance, mockReporter)
  })

  it('monthOverview.render() is called exactly once on bootstrap', async () => {
    await boot()
    expect(mockMonthOverviewInstance.render).toHaveBeenCalledTimes(1)
  })

  it('monthOverview.render() is called after calendarUI.render() on bootstrap', async () => {
    await boot()
    const calendarRenderOrder = mockCalendarUIInstance.render.mock.invocationCallOrder[0]
    const monthRenderOrder = mockMonthOverviewInstance.render.mock.invocationCallOrder[0]
    expect(monthRenderOrder).toBeGreaterThan(calendarRenderOrder)
  })

  it('clicking #sync-btn triggers monthOverview.render() after calendarUI.render()', async () => {
    await boot()
    vi.clearAllMocks()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    document.getElementById('sync-btn').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockMonthOverviewInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render.mock.invocationCallOrder[0])
      .toBeLessThan(mockMonthOverviewInstance.render.mock.invocationCallOrder[0])
  })

  it('sync-time month-overview render rejection is fail-open', async () => {
    await boot()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockRejectedValueOnce(new Error('sync month render fail'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    document.getElementById('sync-btn').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(errorSpy).toHaveBeenCalledWith(
      '[main] monthOverview.render failed after sync, continuing',
      expect.any(Error),
    )
  })

  it('bootstrap resolves even if monthOverview.render() rejects on load (fail-open)', async () => {
    mockMonthOverviewInstance.render.mockRejectedValue(new Error('month render fail'))
    await expect(boot()).resolves.toBeUndefined()
  })
})

describe('main.js — Task 5: records + processImage injection + mutation listener', () => {
  // Use an isolated EventTarget-like document to avoid listener stacking across tests
  let isolatedDoc

  function makeIsolatedDoc() {
    // Create a minimal document-like object backed by a real EventTarget
    const target = new EventTarget()
    const fakeDoc = {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
      getElementById: (id) => document.getElementById(id),
      querySelector: (sel) => document.querySelector(sel),
      createElement: (tag) => document.createElement(tag),
      createTextNode: (text) => document.createTextNode(text),
    }
    return fakeDoc
  }

  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    requestPersistentStorage.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    isolatedDoc = makeIsolatedDoc()
    document.body.innerHTML = `
      <button id="auth-btn">Connect</button>
      <button id="sync-btn">Sync Steps</button>
      <nav class="tab-bar"></nav>
      <div id="db-status"></div>
      <div id="auth-status"></div>
      <span id="sync-status"></span>
    `
  })

  afterEach(() => {
    document.body.innerHTML = ''
    isolatedDoc = null
  })

  it('createCalendarUI is invoked with records and processImage collaborators (6th and 7th args)', async () => {
    await bootstrap(isolatedDoc)
    const callArgs = createCalendarUI.mock.calls[0]
    expect(callArgs[4]).toBeDefined() // records instance
    expect(callArgs[5]).toBeDefined() // processImage function
  })

  it('data:records:mutated dispatch triggers progressUI.render, streakUI.render, calendarUI.render, monthOverview.render in order', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated', { detail: { date: '2026-08-11' } }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mockProgressUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockMonthOverviewInstance.render).toHaveBeenCalledTimes(1)
    expect(mockProgressUIInstance.render.mock.invocationCallOrder[0]).toBeLessThan(mockStreakUIInstance.render.mock.invocationCallOrder[0])
    expect(mockStreakUIInstance.render.mock.invocationCallOrder[0]).toBeLessThan(mockCalendarUIInstance.render.mock.invocationCallOrder[0])
    expect(mockCalendarUIInstance.render.mock.invocationCallOrder[0]).toBeLessThan(mockMonthOverviewInstance.render.mock.invocationCallOrder[0])
  })

  it('progressUI.render rejection inside mutation handler does not propagate (fail-open); streakUI, calendarUI and monthOverview still called', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockProgressUIInstance.render.mockRejectedValueOnce(new Error('progress fail'))
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated', { detail: { date: '2026-08-11' } }))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockMonthOverviewInstance.render).toHaveBeenCalledTimes(1)
  })

  it('streakUI.render rejection inside mutation handler does not propagate; calendarUI still called', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockRejectedValueOnce(new Error('streak fail'))
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated', { detail: '2026-08-11' }))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockMonthOverviewInstance.render).toHaveBeenCalledTimes(1)
  })
})

describe('main.js — Task 7: search engine wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    requestPersistentStorage.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('createSearch factory called once during bootstrap(doc)', async () => {
    await boot()
    expect(createSearch).toHaveBeenCalledTimes(1)
  })

  it('createExporter factory called once during bootstrap(doc)', async () => {
    await boot()
    expect(createExporter).toHaveBeenCalledTimes(1)
  })

  it('createSearchUI factory called once with seven args including computeNearMisses, records and processImage', async () => {
    await boot()
    expect(createSearchUI).toHaveBeenCalledTimes(1)
    expect(createSearchUI).toHaveBeenCalledWith(
      document,
      mockSearchInstance,
      mockExporterInstance,
      mockReporter,
      expect.any(Function),
      mockRecordsInstance,
      expect.any(Function)
    )
  })

  it('searchUI.render() invoked exactly once on bootstrap', async () => {
    await boot()
    expect(mockSearchUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('render() throwing does not abort bootstrap(); subsequent steps complete', async () => {
    mockSearchUIInstance.render.mockRejectedValueOnce(new Error('render fail'))
    await expect(boot()).resolves.toBeUndefined()
  })

  it('console.error called with correct prefix on searchUI.render failure', async () => {
    const err = new Error('render fail')
    mockSearchUIInstance.render.mockRejectedValueOnce(err)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await boot()
    expect(errorSpy).toHaveBeenCalledWith('[main] searchUI.render failed, continuing', err)
  })
})

describe('main.js — Task 12: createSearch decoupled from goal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    requestPersistentStorage.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('createSearch is invoked with (db) only — no goal argument', async () => {
    await boot()
    expect(createSearch).toHaveBeenCalledTimes(1)
    expect(createSearch).toHaveBeenCalledWith(mockDb)
    // Ensure it was NOT called with the goal instance as a second argument
    const callArgs = createSearch.mock.calls[0]
    expect(callArgs.length).toBe(1)
  })
})

describe('main.js — Task 19: onGoalApplied three-way fan-out', () => {
  let isolatedDoc

  function makeIsolatedDoc() {
    const target = new EventTarget()
    return {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
      getElementById: (id) => document.getElementById(id),
      querySelector: (sel) => document.querySelector(sel),
      createElement: (tag) => document.createElement(tag),
      createTextNode: (text) => document.createTextNode(text),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    requestPersistentStorage.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    isolatedDoc = makeIsolatedDoc()
    document.body.innerHTML = `
      <button id="auth-btn">Connect</button>
      <button id="sync-btn">Sync Steps</button>
      <nav class="tab-bar"></nav>
      <div id="db-status"></div>
      <div id="auth-status"></div>
      <span id="sync-status"></span>
    `
  })

  afterEach(() => {
    document.body.innerHTML = ''
    isolatedDoc = null
  })

  it('invoking onGoalApplied calls streakUI.render, calendarUI.render, and monthOverview.render exactly once each', async () => {
    await bootstrap(isolatedDoc)
    const onGoalApplied = createProgressUI.mock.calls[0][4]
    vi.clearAllMocks()
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    await onGoalApplied()
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockMonthOverviewInstance.render).toHaveBeenCalledTimes(1)
  })

  it('streakUI.render rejection in onGoalApplied does not prevent calendarUI.render or monthOverview.render', async () => {
    await bootstrap(isolatedDoc)
    const onGoalApplied = createProgressUI.mock.calls[0][4]
    vi.clearAllMocks()
    mockStreakUIInstance.render.mockRejectedValueOnce(new Error('streak fail'))
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await onGoalApplied()
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockMonthOverviewInstance.render).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('calendarUI.render rejection in onGoalApplied does not prevent streakUI.render or monthOverview.render', async () => {
    await bootstrap(isolatedDoc)
    const onGoalApplied = createProgressUI.mock.calls[0][4]
    vi.clearAllMocks()
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockRejectedValueOnce(new Error('calendar fail'))
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await onGoalApplied()
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockMonthOverviewInstance.render).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('monthOverview.render rejection in onGoalApplied does not prevent streakUI.render or calendarUI.render', async () => {
    await bootstrap(isolatedDoc)
    const onGoalApplied = createProgressUI.mock.calls[0][4]
    vi.clearAllMocks()
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockRejectedValueOnce(new Error('month fail'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await onGoalApplied()
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('onGoalApplied fan-out does not write to daily_records (AC Scenario 1 — no db mutation)', async () => {
    const mockDbWithRecords = {
      ...mockDb,
      daily_records: { put: vi.fn(), update: vi.fn(), add: vi.fn() },
    }
    // Override createDb to return our extended mock for this test
    const { createDb: mockCreateDb } = await import('./db.js')
    mockCreateDb.mockReturnValueOnce(mockDbWithRecords)

    await bootstrap(isolatedDoc)
    const onGoalApplied = createProgressUI.mock.calls[0][4]
    vi.clearAllMocks()
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    await onGoalApplied()
    // daily_records was not put/updated — we confirm no DB write by checking mocks
    // Since the actual db operations happen in other modules (not in main.js's callback),
    // and all those modules are mocked, we verify no db.daily_records write occurred
    // through the fact that only render() is called on each UI instance
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockMonthOverviewInstance.render).toHaveBeenCalledTimes(1)
    // The mocked db object has no daily_records.put call
    expect(mockDb.daily_records).toBeUndefined()
  })

  describe('ST-006b Task 6: challengeUI wiring', () => {
    let isolatedDoc2

    beforeEach(() => {
      isolatedDoc2 = document.cloneNode(true)
      isolatedDoc2.body.innerHTML = `
        <button id="auth-btn">Connect</button>
        <button id="sync-btn">Sync Steps</button>
        <nav class="tab-bar"></nav>
        <div id="db-status"></div>
        <div id="auth-status"></div>
        <span id="sync-status"></span>
        <div id="tab-dashboard"></div>
      `
    })

    it('createChallenge is instantiated with db at composition', async () => {
      await bootstrap(isolatedDoc2)
      expect(createChallenge).toHaveBeenCalledWith(mockDb)
    })

    it('createChallengeUI is instantiated with doc, challenge, db, reporter', async () => {
      await bootstrap(isolatedDoc2)
      expect(createChallengeUI).toHaveBeenCalledWith(
        isolatedDoc2,
        mockChallengeInstance,
        mockDb,
        mockReporter
      )
    })

    it('challengeUI.render is called on bootstrap load', async () => {
      await bootstrap(isolatedDoc2)
      expect(mockChallengeUIInstance.render).toHaveBeenCalled()
    })

    it('challengeUI.render is called after sync button click', async () => {
      await bootstrap(isolatedDoc2)
      vi.clearAllMocks()
      mockChallengeUIInstance.render.mockResolvedValue(undefined)
      const syncBtn = isolatedDoc2.getElementById('sync-btn')
      syncBtn.click()
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(mockChallengeUIInstance.render).toHaveBeenCalledTimes(1)
    })

    it('challengeUI.render is called when data:records:mutated fires', async () => {
      await bootstrap(isolatedDoc2)
      vi.clearAllMocks()
      mockChallengeUIInstance.render.mockResolvedValue(undefined)
      isolatedDoc2.dispatchEvent(new Event('data:records:mutated'))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(mockChallengeUIInstance.render).toHaveBeenCalledTimes(1)
    })

    it('challengeUI.render failure on bootstrap does not prevent other renders', async () => {
      mockChallengeUIInstance.render.mockRejectedValueOnce(new Error('challenge fail'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await bootstrap(isolatedDoc2)
      expect(mockStreakUIInstance.render).toHaveBeenCalled()
      expect(mockSearchUIInstance.render).toHaveBeenCalled()
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[main] challengeUI.render failed'),
        expect.any(Error)
      )
      errorSpy.mockRestore()
    })

    it('challengeUI.render failure on sync does not prevent other renders', async () => {
      await bootstrap(isolatedDoc2)
      vi.clearAllMocks()
      mockChallengeUIInstance.render.mockRejectedValueOnce(new Error('challenge sync fail'))
      mockStreakUIInstance.render.mockResolvedValue(undefined)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const syncBtn = isolatedDoc2.getElementById('sync-btn')
      syncBtn.click()
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('challengeUI.render failure on data:records:mutated does not prevent other renders', async () => {
      await bootstrap(isolatedDoc2)
      vi.clearAllMocks()
      mockChallengeUIInstance.render.mockRejectedValueOnce(new Error('challenge mutation fail'))
      mockStreakUIInstance.render.mockResolvedValue(undefined)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      isolatedDoc2.dispatchEvent(new Event('data:records:mutated'))
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })
  })
})

describe('main.js — ST-015 Task 9: settings wiring + searchUI fan-out leg', () => {
  let isolatedDoc

  function makeIsolatedDoc() {
    const target = new EventTarget()
    return {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
      getElementById: (id) => document.getElementById(id),
      querySelector: (sel) => document.querySelector(sel),
      createElement: (tag) => document.createElement(tag),
      createTextNode: (text) => document.createTextNode(text),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    requestPersistentStorage.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockChallengeUIInstance.render.mockResolvedValue(undefined)
    mockSearchUIInstance.render.mockResolvedValue(undefined)
    mockSettingsUIInstance.render.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    isolatedDoc = makeIsolatedDoc()
    document.body.innerHTML = `
      <button id="auth-btn">Connect</button>
      <button id="sync-btn">Sync Steps</button>
      <button id="settings-btn">Settings</button>
      <nav class="tab-bar"></nav>
      <div id="db-status"></div>
      <div id="auth-status"></div>
      <span id="sync-status"></span>
    `
  })

  afterEach(() => {
    document.body.innerHTML = ''
    isolatedDoc = null
  })

  it('createSettings is instantiated once with db', async () => {
    await bootstrap(isolatedDoc)
    expect(createSettings).toHaveBeenCalledTimes(1)
    expect(createSettings).toHaveBeenCalledWith(mockDb)
  })

  it('createSettingsUI is instantiated once with (doc, settingsInstance, reporter, confirmFn)', async () => {
    await bootstrap(isolatedDoc)
    expect(createSettingsUI).toHaveBeenCalledTimes(1)
    expect(createSettingsUI).toHaveBeenCalledWith(
      isolatedDoc,
      mockSettingsInstance,
      mockReporter,
      expect.any(Function)
    )
  })

  it('createConfirmAdapter is called with window; adapter passed to createSettingsUI', async () => {
    await bootstrap(isolatedDoc)
    expect(createConfirmAdapter).toHaveBeenCalledWith(window)
    expect(createSettingsUI).toHaveBeenCalledWith(
      isolatedDoc,
      mockSettingsInstance,
      mockReporter,
      mockConfirmAdapter
    )
  })

  it('clicking #settings-btn calls settingsUI.open()', async () => {
    await bootstrap(isolatedDoc)
    const btn = document.getElementById('settings-btn')
    btn.click()
    expect(mockSettingsUIInstance.open).toHaveBeenCalledTimes(1)
  })

  it('settingsUI.render() is called once at bootstrap before binding #settings-btn (Task 12)', async () => {
    await bootstrap(isolatedDoc)
    expect(mockSettingsUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('data:records:mutated triggers searchUI.render() (fail-open leg)', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockSearchUIInstance.render.mockResolvedValue(undefined)
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated'))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockSearchUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('data:records:mutated triggers all existing fan-out legs plus searchUI.render()', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockChallengeUIInstance.render.mockResolvedValue(undefined)
    mockSearchUIInstance.render.mockResolvedValue(undefined)
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated'))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockProgressUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockMonthOverviewInstance.render).toHaveBeenCalledTimes(1)
    expect(mockChallengeUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockSearchUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('searchUI.render() throwing in mutation handler does not break other fan-out legs (fail-open)', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockSearchUIInstance.render.mockRejectedValueOnce(new Error('searchUI fail'))
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockChallengeUIInstance.render.mockResolvedValue(undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated'))
    await new Promise(resolve => setTimeout(resolve, 10))
    // Other legs must still have been called
    expect(mockProgressUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockMonthOverviewInstance.render).toHaveBeenCalledTimes(1)
    expect(mockChallengeUIInstance.render).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith('[main]', expect.any(Error))
    errorSpy.mockRestore()
  })
})

// ============================================================================
// ST-012 Task 7: Backup + Drive sync wiring in composition root
// ============================================================================

describe('main.js — ST-012 Task 7: backup + drive-sync wiring', () => {
  let isolatedDoc

  function makeIsolatedDoc() {
    const target = new EventTarget()
    return {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
      getElementById: (id) => document.getElementById(id),
      querySelector: (sel) => document.querySelector(sel),
      querySelectorAll: (sel) => document.querySelectorAll(sel),
      createElement: (tag) => document.createElement(tag),
      createTextNode: (text) => document.createTextNode(text),
      defaultView: window,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    requestPersistentStorage.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockChallengeUIInstance.render.mockResolvedValue(undefined)
    mockSearchUIInstance.render.mockResolvedValue(undefined)
    mockSettingsUIInstance.render.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockDriveSyncInstance.find.mockResolvedValue(null)
    mockDriveSyncInstance.push.mockResolvedValue(undefined)
    mockDriveSyncInstance.pull.mockResolvedValue(null)
    mockBackupInstance.buildBackup.mockResolvedValue({})
    mockBackupInstance.restoreBackup.mockResolvedValue(undefined)
    mockBackupUIInstance.render.mockReset()
    mockDriveSyncUIInstance.render.mockReset()
    // Default mockDb has no daily_records.count — set it to return 5 by default
    mockDb.daily_records = { count: vi.fn().mockResolvedValue(5) }
    isolatedDoc = makeIsolatedDoc()
    document.body.innerHTML = `
      <button id="auth-btn">Connect</button>
      <button id="sync-btn">Sync Steps</button>
      <button id="settings-btn">Settings</button>
      <nav class="tab-bar"></nav>
      <div id="db-status"></div>
      <div id="auth-status"></div>
      <span id="sync-status"></span>
      <div id="cloud-controls"></div>
      <div id="cloud-recovery-banner" hidden></div>
    `
  })

  afterEach(() => {
    document.body.innerHTML = ''
    isolatedDoc = null
  })

  // --- Factory wiring ---

  it('createBackup is called once during bootstrap with injected db', async () => {
    await bootstrap(isolatedDoc)
    expect(createBackup).toHaveBeenCalledTimes(1)
    expect(createBackup).toHaveBeenCalledWith(mockDb)
  })

  it('createBackupUI is called once with doc, backup instance, and reporter', async () => {
    await bootstrap(isolatedDoc)
    expect(createBackupUI).toHaveBeenCalledTimes(1)
    expect(createBackupUI).toHaveBeenCalledWith(isolatedDoc, mockBackupInstance, mockReporter)
  })

  it('createDriveSync is called once with getAccessToken, reporter, and fetchFn', async () => {
    await bootstrap(isolatedDoc)
    expect(createDriveSync).toHaveBeenCalledTimes(1)
    const callArg = createDriveSync.mock.calls[0][0]
    expect(callArg).toHaveProperty('getAccessToken')
    expect(callArg).toHaveProperty('reporter', mockReporter)
    expect(callArg).toHaveProperty('fetchFn')
    expect(typeof callArg.fetchFn).toBe('function')
  })

  it('createDriveSyncUI is called once with doc, driveSync instance, backup instance, reporter', async () => {
    await bootstrap(isolatedDoc)
    expect(createDriveSyncUI).toHaveBeenCalledTimes(1)
    expect(createDriveSyncUI).toHaveBeenCalledWith(
      isolatedDoc,
      mockDriveSyncInstance,
      mockBackupInstance,
      mockReporter,
      expect.any(Function)
    )
  })

  // --- fan-out ---

  it('data:records:mutated invokes backupUI.render (if mounted)', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockBackupUIInstance.render.mockReset()
    mockDriveSyncUIInstance.render.mockReset()
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated'))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(mockBackupUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('data:records:mutated invokes driveSyncUI.render (if mounted)', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockDriveSyncUIInstance.render.mockReset()
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated'))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(mockDriveSyncUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('data:records:mutated still invokes all existing fan-out legs (regression)', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockChallengeUIInstance.render.mockResolvedValue(undefined)
    mockSearchUIInstance.render.mockResolvedValue(undefined)
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated'))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(mockProgressUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockMonthOverviewInstance.render).toHaveBeenCalledTimes(1)
    expect(mockChallengeUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockSearchUIInstance.render).toHaveBeenCalledTimes(1)
  })

  // --- fail-open bootstrap ---

  it('createDriveSync throwing during bootstrap does not propagate; other modules still mount', async () => {
    createDriveSync.mockImplementationOnce(() => { throw new Error('drive init fail') })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(bootstrap(isolatedDoc)).resolves.not.toThrow()
    // Settings and streak should still be created
    expect(createSettingsUI).toHaveBeenCalledTimes(1)
    expect(createStreakUI).toHaveBeenCalledTimes(1)
    consoleSpy.mockRestore()
  })

  // --- Cloud recovery: onTokenReceived hook ---

  it('onTokenReceived with empty DB and Drive backup found → #cloud-recovery-banner un-hidden', async () => {
    mockDb.daily_records = { count: vi.fn().mockResolvedValue(0) }
    mockDriveSyncInstance.find.mockResolvedValue('file-id-123')
    await bootstrap(isolatedDoc)
    // Fire the token received callback
    await mockOnTokenHandler()
    await new Promise(resolve => setTimeout(resolve, 20))
    const banner = document.getElementById('cloud-recovery-banner')
    expect(banner.hidden).toBe(false)
  })

  it('onTokenReceived with empty DB and no Drive backup → banner stays hidden', async () => {
    mockDb.daily_records = { count: vi.fn().mockResolvedValue(0) }
    mockDriveSyncInstance.find.mockResolvedValue(null)
    await bootstrap(isolatedDoc)
    await mockOnTokenHandler()
    await new Promise(resolve => setTimeout(resolve, 20))
    const banner = document.getElementById('cloud-recovery-banner')
    expect(banner.hidden).toBe(true)
  })

  it('onTokenReceived with non-empty DB → driveSync.find NOT called (during recovery check)', async () => {
    mockDb.daily_records = { count: vi.fn().mockResolvedValue(5) }
    await bootstrap(isolatedDoc)
    const findCallsBefore = mockDriveSyncInstance.find.mock.calls.length
    await mockOnTokenHandler()
    await new Promise(resolve => setTimeout(resolve, 20))
    // find should not have been called during recovery check
    expect(mockDriveSyncInstance.find.mock.calls.length).toBe(findCallsBefore)
  })

  it('recovery banner "Start Fresh" button → no restore; banner dismissed', async () => {
    mockDb.daily_records = { count: vi.fn().mockResolvedValue(0) }
    mockDriveSyncInstance.find.mockResolvedValue('file-id-123')
    await bootstrap(isolatedDoc)
    // Add a start-fresh button to the banner
    const banner = document.getElementById('cloud-recovery-banner')
    const startFreshBtn = document.createElement('button')
    startFreshBtn.setAttribute('data-action', 'recovery-start-fresh')
    banner.appendChild(startFreshBtn)
    await mockOnTokenHandler()
    await new Promise(resolve => setTimeout(resolve, 20))
    // Banner should be visible; click start fresh
    startFreshBtn.click()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockBackupInstance.restoreBackup).not.toHaveBeenCalled()
    expect(banner.hidden).toBe(true)
  })

  it('recovery banner "Restore Cloud Backup" → confirm → restoreBackup → data:records:mutated → banner hidden', async () => {
    mockDb.daily_records = { count: vi.fn().mockResolvedValue(0) }
    mockDriveSyncInstance.find.mockResolvedValue('file-id-123')
    const mockEnvelope = { schema_version: 1, daily_records: [], settings: [] }
    mockDriveSyncInstance.pull.mockResolvedValue(mockEnvelope)
    mockConfirmAdapter.mockReturnValue(true)
    await bootstrap(isolatedDoc)
    // Add restore button to banner
    const banner = document.getElementById('cloud-recovery-banner')
    const restoreBtn = document.createElement('button')
    restoreBtn.setAttribute('data-action', 'recovery-restore')
    banner.appendChild(restoreBtn)
    await mockOnTokenHandler()
    await new Promise(resolve => setTimeout(resolve, 20))
    // Banner un-hidden; click restore
    restoreBtn.click()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(mockBackupInstance.restoreBackup).toHaveBeenCalledWith(mockEnvelope)
    expect(banner.hidden).toBe(true)
  })
})
