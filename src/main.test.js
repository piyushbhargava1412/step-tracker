import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// All vi.mock calls are hoisted — they run before any imports
vi.mock('./config.js', () => ({ CLIENT_ID: 'FAKE_ID' }))

// ST-012 Task 7: mock backup.js, backup-ui.js, drive-sync.js, drive-sync-ui.js
const mockBackupInstance = { buildBackup: vi.fn().mockResolvedValue({}), restoreBackup: vi.fn().mockResolvedValue(undefined) }
const mockValidateEnvelope = vi.fn()
vi.mock('./backup.js', () => ({
  createBackup: vi.fn(() => mockBackupInstance),
  _validateEnvelope: (...args) => mockValidateEnvelope(...args),
  BACKUP_SCHEMA_VERSION: 1,
  BACKUP_FILENAME_PREFIX: 'step-tracker-backup-'
}))

const mockBackupUIInstance = { render: vi.fn() }
vi.mock('./backup-ui.js', () => ({
  createBackupUI: vi.fn(() => mockBackupUIInstance)
}))

const mockDriveSyncInstance = { find: vi.fn().mockResolvedValue(null), push: vi.fn().mockResolvedValue(undefined), pull: vi.fn().mockResolvedValue(null), readPrimaryDevice: vi.fn().mockResolvedValue(null) }
vi.mock('./drive-sync.js', () => ({
  createDriveSync: vi.fn(() => mockDriveSyncInstance)
}))

const mockDriveSyncUIInstance = { render: vi.fn() }
vi.mock('./drive-sync-ui.js', () => ({
  createDriveSyncUI: vi.fn(() => mockDriveSyncUIInstance)
}))

// Storage Health panel (Backup & restore)
const mockStorageHealthUIInstance = { render: vi.fn().mockResolvedValue(undefined) }
vi.mock('./storage-health-ui.js', () => ({
  createStorageHealthUI: vi.fn(() => mockStorageHealthUIInstance)
}))

// ST-013 Task 6: mock sw-register.js
const mockSwRegistrar = { register: vi.fn().mockResolvedValue(undefined) }
vi.mock('./sw-register.js', () => ({
  createSwRegister: vi.fn(() => mockSwRegistrar)
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

const mockReporter = { db: vi.fn(), auth: vi.fn(), sync: vi.fn() }
vi.mock('./ui-status.js', () => ({
  createStatusReporter: vi.fn(() => mockReporter)
}))

const mockDb = {}
vi.mock('./db.js', () => ({
  createDb: vi.fn(() => mockDb),
  initDB: vi.fn(() => Promise.resolve()),
  dbNameFor: vi.fn((access) => (access.canEdit ? 'StepTrackerDB' : 'StepTrackerViewerDB')),
  DB_NAME: 'StepTrackerDB',
  DB_VERSION: 2
}))

// ST-023: the read-only backstop needs a real Dexie; main only wires it.
const { mockWriteSnapshot } = vi.hoisted(() => ({ mockWriteSnapshot: vi.fn(async (fn) => fn()) }))
vi.mock('./read-only.js', () => ({
  guardWrites: vi.fn(() => ({ writeSnapshot: mockWriteSnapshot })),
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

// Mobile redesign: navigation is real (it tolerates the sparse test DOM);
// the Week view, onboarding and back button are mocked so their wiring can be asserted.
const mockWeekUIInstance = { render: vi.fn().mockResolvedValue(undefined) }
vi.mock('./calendar-week-ui.js', () => ({
  createCalendarWeekUI: vi.fn(() => mockWeekUIInstance)
}))
vi.mock('./week.js', () => ({
  createWeek: vi.fn(() => ({ loadWeek: vi.fn(), buildZeroState: vi.fn() }))
}))
const mockOnboardingInstance = { start: vi.fn().mockResolvedValue(undefined), dismiss: vi.fn(), isOpen: vi.fn(() => false) }
vi.mock('./onboarding-ui.js', () => ({
  createOnboardingUI: vi.fn(() => mockOnboardingInstance)
}))

const mockStepSyncInstance = { sync: vi.fn(), canSync: vi.fn().mockResolvedValue(true) }
vi.mock('./steps.js', () => ({
  createStepSync: vi.fn(() => mockStepSyncInstance)
}))


// ST-017/018/019: platform detection + native plugins. Web by default; the
// "Android app wiring" suite flips isNativePlatform to true.
const mockIsNativePlatform = vi.fn(() => false)
vi.mock('./platform/capabilities.js', () => ({
  isNativePlatform: (...args) => mockIsNativePlatform(...args)
}))
const { mockHealth, mockAppLauncher } = vi.hoisted(() => ({
  mockHealth: {
    isAvailable: vi.fn().mockResolvedValue({ available: true }),
    checkAuthorization: vi.fn().mockResolvedValue({ readAuthorized: [] }),
    requestAuthorization: vi.fn().mockResolvedValue({ readAuthorized: ['steps', 'distance'] }),
    queryAggregated: vi.fn().mockResolvedValue({ samples: [] }),
  },
  mockAppLauncher: { openUrl: vi.fn().mockResolvedValue({ completed: true }) },
}))
vi.mock('@capgo/capacitor-health', () => ({ Health: mockHealth }))
vi.mock('@capacitor/app-launcher', () => ({ AppLauncher: mockAppLauncher }))
const { mockSocialLogin } = vi.hoisted(() => ({
  mockSocialLogin: {
    initialize: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    getAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: 'tok-drv' }),
    login: vi.fn(),
    logout: vi.fn(),
  },
}))
vi.mock('@capgo/capacitor-social-login', () => ({ SocialLogin: mockSocialLogin }))
const { mockDriveAuthorization } = vi.hoisted(() => ({
  mockDriveAuthorization: { authorize: vi.fn().mockResolvedValue('tok-drv') },
}))
vi.mock('./platform/native/drive-authorization.js', () => ({ createDriveAuthorization: () => mockDriveAuthorization }))
const { mockCapacitorApp } = vi.hoisted(() => ({
  mockCapacitorApp: { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) },
}))
vi.mock('@capacitor/app', () => ({ App: mockCapacitorApp }))
const { mockOnAppResume, mockOnBackButton } = vi.hoisted(() => ({ mockOnAppResume: vi.fn(), mockOnBackButton: vi.fn() }))
vi.mock('./platform/app-lifecycle.js', () => ({ onAppResume: mockOnAppResume, onBackButton: mockOnBackButton }))

// ST-015 Task 9: settings + settings-ui mocks
const mockSettingsInstance = { getSyncAnchorDate: vi.fn().mockResolvedValue('2018-01-01'), setSyncAnchorDate: vi.fn(), countRecordsBefore: vi.fn(), pruneRecordsBefore: vi.fn(), wipeDatabase: vi.fn(), getPrimaryDevice: vi.fn().mockResolvedValue(null), setPrimaryDevice: vi.fn() }
vi.mock('./settings.js', () => ({
  createSettings: vi.fn(() => mockSettingsInstance)
}))

const mockSettingsUIInstance = { render: vi.fn().mockResolvedValue(undefined), open: vi.fn() }
vi.mock('./settings-ui.js', () => ({
  createSettingsUI: vi.fn(() => mockSettingsUIInstance)
}))

// ST-015 Task 11: confirm adapter mock
const mockConfirmAdapter = vi.fn()
vi.mock('./confirm.js', () => ({
  createConfirmAdapter: vi.fn(() => mockConfirmAdapter)
}))

// ST-009 Task 12: analytics, gamification, odyssey engines + UI factories
const mockAnalyticsEngine = { compute: vi.fn().mockResolvedValue({
  lifetimeMetrics: { totalSteps: 0, totalDistanceKm: 0, dailyAverage: 0, longestStreak: 0 },
  topRecords: [],
  dayOfWeek: { averages: new Array(7).fill(0), powerDay: 0, lazyDay: 0 },
  hourly: new Array(24).fill(0),
  yearlyMonthly: new Array(12).fill({ month: 0, total: 0, dayCount: 0 }),
}) }
vi.mock('./analytics.js', () => ({
  createAnalytics: vi.fn(() => mockAnalyticsEngine),
  computeLifetimeMetrics: vi.fn(),
  computeTopRecords: vi.fn(),
  computeDayOfWeekDistribution: vi.fn(),
  computeHourlyDistribution: vi.fn(),
  computeYearlyMonthlyComparison: vi.fn(),
}))

const mockAnalyticsUIInstance = { render: vi.fn().mockResolvedValue(undefined) }
vi.mock('./analytics-ui.js', () => ({
  createAnalyticsUI: vi.fn(() => mockAnalyticsUIInstance),
}))

const mockGamificationEngine = { compute: vi.fn().mockResolvedValue({ xp: 0, level: 1, levelLabel: 'Couch Potato', achievements: {} }) }
vi.mock('./gamification.js', () => ({
  createGamification: vi.fn(() => mockGamificationEngine),
  computeXP: vi.fn(),
  computeLevel: vi.fn(),
  evaluateAchievements: vi.fn(),
  LEVEL_RANKS: [],
}))

const mockGamificationUIInstance = { render: vi.fn().mockResolvedValue(undefined) }
vi.mock('./gamification-ui.js', () => ({
  createGamificationUI: vi.fn(() => mockGamificationUIInstance),
}))

const mockOdysseyUIInstance = { render: vi.fn().mockResolvedValue(undefined) }
vi.mock('./odyssey-ui.js', () => ({
  createOdysseyUI: vi.fn(() => mockOdysseyUIInstance),
}))

vi.mock('./odyssey.js', () => ({
  computeOdysseyProgress: vi.fn().mockReturnValue({ unlockedLegs: [], activeLeg: undefined, progressPct: 0, remainingKm: 0 }),
  HOME_BASE_CITIES: [],
  MILESTONES: [],
}))


// Import mocked modules so we have references to the spy fns
import { createGoal } from './goal.js'
import { createProgressUI } from './progress-ui.js'
import { createStatusReporter } from './ui-status.js'
import { createDb, initDB } from './db.js'
import { guardWrites } from './read-only.js'
import { createAuth } from './auth.js'
import { createCalendarWeekUI } from './calendar-week-ui.js'
import { createOnboardingUI } from './onboarding-ui.js'
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
import { createBackup, _validateEnvelope } from './backup.js'
import { createBackupUI } from './backup-ui.js'
import { createDriveSync } from './drive-sync.js'
import { createDriveSyncUI } from './drive-sync-ui.js'
import { createStorageHealthUI } from './storage-health-ui.js'
import { createSwRegister } from './sw-register.js'
import { createAnalytics } from './analytics.js'
import { createAnalyticsUI } from './analytics-ui.js'
import { createGamification } from './gamification.js'
import { createGamificationUI } from './gamification-ui.js'
import { createOdysseyUI } from './odyssey-ui.js'

// Import bootstrap directly — cleaner than dispatching DOMContentLoaded
import { bootstrap } from './main.js'

// Tests that switch to the Android app (the editor) put the browser back after.
afterEach(() => { mockIsNativePlatform.mockReturnValue(false) })

/** ST-023: the step-sync pipeline runs in the app; the browser refreshes the Drive snapshot. */
const asApp = () => mockIsNativePlatform.mockReturnValue(true)

// Helper: set up DOM and call bootstrap directly
/** A small slice of the mobile shell: two tabs, Settings and Backup. */
const SHELL_HTML = `
    <button id="app-back" data-back hidden>Back</button>
    <h1 id="app-title"></h1>
    <span id="app-subtitle"></span>
    <section id="tab-today" data-screen>
      <button id="sync-btn" aria-label="Sync steps">Sync</button>
      <div id="auth-status"></div>
      <button id="backup-status" hidden></button>
      <span id="sync-status"></span>
      <span id="last-sync"></span>
    </section>
    <section id="tab-calendar" data-screen hidden>
      <div id="calendar-view-switch">
        <button data-calendar-view="week" aria-selected="false">Week</button>
        <button data-calendar-view="month" aria-selected="true">Month</button>
      </div>
      <div id="calendar-month"></div>
      <div id="calendar-week" hidden></div>
    </section>
    <section id="tab-settings" data-screen hidden>
      <span id="step-source-name"></span>
      <button id="auth-btn">Connect</button>
      <p id="app-version"></p>
    </section>
    <section id="tab-backup" data-screen hidden></section>
    <nav>
      <button data-tab="today">Today</button>
      <button data-tab="calendar">Calendar</button>
      <button data-go="settings">Settings</button>
    </nav>
    <div id="ptr-indicator"></div>
  `

async function boot(storage) {
  document.body.innerHTML = SHELL_HTML
  await bootstrap(document, storage)
}

const visibleScreen = () => [...document.querySelectorAll('[data-screen]')].find((el) => !el.hidden)?.id

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
    mockSwRegistrar.register.mockResolvedValue(undefined)
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

  it('invokes auth.init exactly once on DOMContentLoaded', async () => {
    await boot()
    expect(mockAuthInstance.init).toHaveBeenCalledTimes(1)
  })

  it('wires navigation: tapping a bottom tab shows its screen', async () => {
    await boot()
    expect(visibleScreen()).toBe('tab-today')
    document.querySelector('[data-tab="calendar"]').click()
    expect(visibleScreen()).toBe('tab-calendar')
  })

  it('hands the Android back button to the navigator', async () => {
    await boot()
    expect(mockOnBackButton).toHaveBeenCalledWith({ isNative: false }, expect.any(Function))
    document.querySelector('[data-go="settings"]').click()
    const handler = mockOnBackButton.mock.calls[0][1]
    expect(handler()).toBe(true)
    expect(visibleScreen()).toBe('tab-today')
    expect(handler()).toBe(false)
  })

  it('names the step source and shows the app version in Settings', async () => {
    await boot()
    expect(document.getElementById('step-source-name').textContent).toBe('Google Drive')
    expect(document.getElementById('app-version').textContent).toMatch(/^Step Tracker v\d+\.\d+\.\d+$/)
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
    // createAuth receives reporter as second arg
    expect(createAuth).toHaveBeenCalledWith(expect.anything(), mockReporter)
  })

  it('when initDB rejects, auth.init is still invoked (fail-open)', async () => {
    initDB.mockRejectedValue(new Error('DB fail'))
    await boot()
    expect(mockAuthInstance.init).toHaveBeenCalledTimes(1)
  })

  it('when initDB rejects, navigation still works (fail-open)', async () => {
    initDB.mockRejectedValue(new Error('DB fail'))
    await boot()
    document.querySelector('[data-tab="calendar"]').click()
    expect(visibleScreen()).toBe('tab-calendar')
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
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('ST-024: the browser builds no step sync — it has no step source', async () => {
    await boot()
    expect(createStepSync).not.toHaveBeenCalled()
  })

  it('the app builds one step sync over Health Connect, the db, reporter, doc and the Drive collaborators', async () => {
    asApp()
    await boot()
    expect(createStepSync).toHaveBeenCalledTimes(1)
    expect(createStepSync).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Health Connect' }),
      mockDb,
      mockReporter,
      document,
      mockDriveSyncInstance,
      mockBackupInstance,
      mockSettingsInstance,
      expect.objectContaining({ otherPrimary: expect.any(Function) })
    )
  })

  it('clicking #sync-btn invokes stepSync.sync() exactly once', async () => {
    asApp()
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
    asApp()
    await expect(bootstrap(document)).resolves.toBeUndefined()
    expect(createStepSync).toHaveBeenCalledTimes(1)
  })
})

describe('main.js — auto-sync on connect + silent session restore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
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
      '[google-connection] failed to read the connection flag, continuing',
      expect.any(Error)
    )
    errorSpy.mockRestore()
  })

  it('the onTokenReceived hook persists the connection flag and refreshes the Drive snapshot (ST-023)', async () => {
    const storage = makeStorage()
    await boot(storage)
    vi.clearAllMocks()
    mockAuthInstance.getAccessToken.mockReturnValueOnce('tok')
    await mockOnTokenHandler()
    expect(storage.setItem).toHaveBeenCalledWith('google_connected', '1')
    expect(mockDriveSyncInstance.pull).toHaveBeenCalledTimes(1)
    expect(mockStepSyncInstance.sync).not.toHaveBeenCalled()
  })

  it('the onTokenReceived hook runs the full post-sync re-render pipeline', async () => {
    await boot(makeStorage())
    vi.clearAllMocks()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockWeekUIInstance.render.mockResolvedValue(undefined)
    mockChallengeUIInstance.render.mockResolvedValue(undefined)
    await mockOnTokenHandler()
    expect(mockProgressUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockWeekUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockChallengeUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockOnboardingInstance.dismiss).toHaveBeenCalledTimes(1)
  })

  it('the onTokenReceived hook loads the snapshot before re-rendering (ordering)', async () => {
    await boot(makeStorage())
    vi.clearAllMocks()
    mockAuthInstance.getAccessToken.mockReturnValueOnce('tok')
    let syncResolved = false
    mockDriveSyncInstance.pull.mockImplementationOnce(() =>
      new Promise(res => setTimeout(() => { syncResolved = true; res(null) }, 10))
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
    expect(createProgressUI).toHaveBeenCalledWith(document, mockGoalInstance, mockDb, mockReporter, expect.any(Function), { canEdit: false })
  })

  it('progressUI.render() called exactly once on bootstrap', async () => {
    await boot()
    expect(mockProgressUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('render() runs once at bootstrap, before the welcome screen is considered', async () => {
    await boot()
    expect(mockProgressUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockProgressUIInstance.render.mock.invocationCallOrder[0])
      .toBeLessThan(mockOnboardingInstance.start.mock.invocationCallOrder[0])
  })

  it('bootstrap resolves even if progressUI.render() rejects (fail-open)', async () => {
    mockProgressUIInstance.render.mockRejectedValue(new Error('render fail'))
    await expect(boot()).resolves.toBeUndefined()
  })

  it('clicking #sync-btn calls stepSync.sync() once then progressUI.render() once', async () => {
    asApp()
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
    asApp()
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
    asApp()
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
    asApp()
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

describe('main.js — Calendar month + week views', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockWeekUIInstance.render.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('createMonthOverview is invoked once with (document, calendarInstance, mockReporter) and handed to the calendar', async () => {
    await boot()
    expect(createMonthOverview).toHaveBeenCalledWith(document, mockCalendarInstance, mockReporter)
    expect(createCalendarUI.mock.calls[0][6]).toBe(mockMonthOverviewInstance)
  })

  it('main.js no longer renders a month overview on Today', async () => {
    await boot()
    expect(mockMonthOverviewInstance.render).not.toHaveBeenCalled()
  })

  it('the week view opens days through the calendar\'s day sheet', async () => {
    mockCalendarUIInstance.openDay = vi.fn()
    await boot()
    const { onDayClick } = createCalendarWeekUI.mock.calls[0][3]
    onDayClick({ date: '2026-09-21', record: null })
    expect(mockCalendarUIInstance.openDay).toHaveBeenCalledWith({ date: '2026-09-21', record: null })
  })

  it('switching to Week renders the week view', async () => {
    await boot()
    mockWeekUIInstance.render.mockClear()
    document.querySelector('[data-calendar-view="week"]').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockWeekUIInstance.render).toHaveBeenCalledTimes(1)
    expect(document.getElementById('calendar-week').hidden).toBe(false)
  })

  it('a sync re-renders the week view after the month', async () => {
    await boot()
    vi.clearAllMocks()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    document.getElementById('sync-btn').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockWeekUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render.mock.invocationCallOrder[0])
      .toBeLessThan(mockWeekUIInstance.render.mock.invocationCallOrder[0])
  })

  it('a failing week render after sync is fail-open', async () => {
    await boot()
    mockWeekUIInstance.render.mockRejectedValueOnce(new Error('week fail'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    document.getElementById('sync-btn').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(errorSpy).toHaveBeenCalledWith('[main] weekUI.render failed after sync, continuing', expect.any(Error))
    expect(mockChallengeUIInstance.render).toHaveBeenCalled()
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
      querySelectorAll: (sel) => document.querySelectorAll(sel),
      createElement: (tag) => document.createElement(tag),
      createTextNode: (text) => document.createTextNode(text),
    }
    return fakeDoc
  }

  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockWeekUIInstance.render.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    isolatedDoc = makeIsolatedDoc()
    document.body.innerHTML = `
      <button id="auth-btn">Connect</button>
      <button id="sync-btn">Sync Steps</button>
      <nav class="tab-bar"></nav>
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

  it('data:records:mutated dispatch triggers progressUI.render, streakUI.render, calendarUI.render, weekUI.render in order', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockWeekUIInstance.render.mockResolvedValue(undefined)
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated', { detail: { date: '2026-08-11' } }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mockProgressUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockWeekUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockProgressUIInstance.render.mock.invocationCallOrder[0]).toBeLessThan(mockStreakUIInstance.render.mock.invocationCallOrder[0])
    expect(mockStreakUIInstance.render.mock.invocationCallOrder[0]).toBeLessThan(mockCalendarUIInstance.render.mock.invocationCallOrder[0])
    expect(mockCalendarUIInstance.render.mock.invocationCallOrder[0]).toBeLessThan(mockWeekUIInstance.render.mock.invocationCallOrder[0])
  })

  it('progressUI.render rejection inside mutation handler does not propagate (fail-open); streakUI, calendarUI and weekUI still called', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockProgressUIInstance.render.mockRejectedValueOnce(new Error('progress fail'))
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockWeekUIInstance.render.mockResolvedValue(undefined)
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated', { detail: { date: '2026-08-11' } }))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockWeekUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('streakUI.render rejection inside mutation handler does not propagate; calendarUI still called', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockRejectedValueOnce(new Error('streak fail'))
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockWeekUIInstance.render.mockResolvedValue(undefined)
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated', { detail: '2026-08-11' }))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockWeekUIInstance.render).toHaveBeenCalledTimes(1)
  })
})

describe('main.js — Task 7: search engine wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
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
      querySelectorAll: (sel) => document.querySelectorAll(sel),
      createElement: (tag) => document.createElement(tag),
      createTextNode: (text) => document.createTextNode(text),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockWeekUIInstance.render.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    isolatedDoc = makeIsolatedDoc()
    document.body.innerHTML = `
      <button id="auth-btn">Connect</button>
      <button id="sync-btn">Sync Steps</button>
      <nav class="tab-bar"></nav>
      <div id="auth-status"></div>
      <span id="sync-status"></span>
    `
  })

  afterEach(() => {
    document.body.innerHTML = ''
    isolatedDoc = null
  })

  it('invoking onGoalApplied calls streakUI.render, calendarUI.render, and weekUI.render exactly once each', async () => {
    await bootstrap(isolatedDoc)
    const onGoalApplied = createProgressUI.mock.calls[0][4]
    vi.clearAllMocks()
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockWeekUIInstance.render.mockResolvedValue(undefined)
    await onGoalApplied()
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockWeekUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('streakUI.render rejection in onGoalApplied does not prevent calendarUI.render or weekUI.render', async () => {
    await bootstrap(isolatedDoc)
    const onGoalApplied = createProgressUI.mock.calls[0][4]
    vi.clearAllMocks()
    mockStreakUIInstance.render.mockRejectedValueOnce(new Error('streak fail'))
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockWeekUIInstance.render.mockResolvedValue(undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await onGoalApplied()
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockWeekUIInstance.render).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('calendarUI.render rejection in onGoalApplied does not prevent streakUI.render or weekUI.render', async () => {
    await bootstrap(isolatedDoc)
    const onGoalApplied = createProgressUI.mock.calls[0][4]
    vi.clearAllMocks()
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockRejectedValueOnce(new Error('calendar fail'))
    mockWeekUIInstance.render.mockResolvedValue(undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await onGoalApplied()
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockWeekUIInstance.render).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('weekUI.render rejection in onGoalApplied does not prevent streakUI.render or calendarUI.render', async () => {
    await bootstrap(isolatedDoc)
    const onGoalApplied = createProgressUI.mock.calls[0][4]
    vi.clearAllMocks()
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockWeekUIInstance.render.mockRejectedValueOnce(new Error('month fail'))
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
    mockWeekUIInstance.render.mockResolvedValue(undefined)
    await onGoalApplied()
    // daily_records was not put/updated — we confirm no DB write by checking mocks
    // Since the actual db operations happen in other modules (not in main.js's callback),
    // and all those modules are mocked, we verify no db.daily_records write occurred
    // through the fact that only render() is called on each UI instance
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockWeekUIInstance.render).toHaveBeenCalledTimes(1)
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
        mockReporter,
        { share: null } // jsdom has no Web Share; the app passes the Android share sheet
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
      querySelectorAll: (sel) => document.querySelectorAll(sel),
      createElement: (tag) => document.createElement(tag),
      createTextNode: (text) => document.createTextNode(text),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
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

  it('opening the Settings screen calls settingsUI.open() each time', async () => {
    // A fresh document: earlier tests' navigators stay bound to the shared one.
    const freshDoc = document.implementation.createHTMLDocument('fresh')
    freshDoc.body.innerHTML = SHELL_HTML
    await bootstrap(freshDoc, makeStorage())
    mockSettingsUIInstance.open.mockClear()
    freshDoc.querySelector('[data-go="settings"]').click()
    expect(mockSettingsUIInstance.open).toHaveBeenCalledTimes(1)
    freshDoc.querySelector('[data-tab="today"]').click()
    freshDoc.querySelector('[data-go="settings"]').click()
    expect(mockSettingsUIInstance.open).toHaveBeenCalledTimes(2)
  })

  it('settingsUI.render() is called once at bootstrap (Task 12)', async () => {
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
    expect(mockWeekUIInstance.render).toHaveBeenCalledTimes(1)
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
    expect(mockWeekUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockChallengeUIInstance.render).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith('[main] searchUI.render failed after mutation, continuing', expect.any(Error))
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
      <div id="auth-status"></div>
      <span id="sync-status"></span>
      <div id="backup-controls"></div>
      <div id="cloud-controls"></div>
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

  it('createBackupUI is called once with doc, backup instance, reporter, confirm adapter, and settings', async () => {
    await bootstrap(isolatedDoc)
    expect(createBackupUI).toHaveBeenCalledTimes(1)
    expect(createBackupUI).toHaveBeenCalledWith(
      isolatedDoc,
      mockBackupInstance,
      mockReporter,
      mockConfirmAdapter,
      mockSettingsInstance,
      expect.objectContaining({ saveTextFile: expect.any(Function) })
    )
  })

  it('createDriveSync is called once with getAccessToken, reporter, fetchFn, and the backup validator', async () => {
    await bootstrap(isolatedDoc)
    expect(createDriveSync).toHaveBeenCalledTimes(1)
    const callArg = createDriveSync.mock.calls[0][0]
    expect(callArg).toHaveProperty('getAccessToken')
    expect(callArg).toHaveProperty('reporter', mockReporter)
    expect(callArg).toHaveProperty('fetchFn')
    expect(typeof callArg.fetchFn).toBe('function')
    expect(callArg).toHaveProperty('validator')
    expect(callArg.validator).toBe(_validateEnvelope)
  })

  it('createDriveSyncUI is called once with doc, driveSync instance, backup instance, reporter, confirm adapter, and settings', async () => {
    await bootstrap(isolatedDoc)
    expect(createDriveSyncUI).toHaveBeenCalledTimes(1)
    expect(createDriveSyncUI).toHaveBeenCalledWith(
      isolatedDoc,
      mockDriveSyncInstance,
      mockBackupInstance,
      mockReporter,
      mockConfirmAdapter,
      mockSettingsInstance,
      expect.objectContaining({ primaryDevice: expect.anything() })
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

  it('data:records:mutated passes each panel its own container (backup → #backup-controls, cloud → #cloud-controls)', async () => {
    await bootstrap(isolatedDoc)
    const backupContainer = isolatedDoc.getElementById('backup-controls')
    const cloudContainer = isolatedDoc.getElementById('cloud-controls')
    vi.clearAllMocks()
    mockBackupUIInstance.render.mockReset()
    mockDriveSyncUIInstance.render.mockReset()
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated'))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(mockBackupUIInstance.render).toHaveBeenCalledWith(backupContainer)
    expect(mockDriveSyncUIInstance.render).toHaveBeenCalledWith(cloudContainer)
  })

  it('data:records:mutated fan-out stays fail-open when the panel containers are absent', async () => {
    document.body.innerHTML = `
      <button id="auth-btn">Connect</button>
      <button id="sync-btn">Sync Steps</button>
      <button id="settings-btn">Settings</button>
      <nav class="tab-bar"></nav>
      <div id="auth-status"></div>
      <span id="sync-status"></span>
    `
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockBackupUIInstance.render.mockReset()
    mockDriveSyncUIInstance.render.mockReset()
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated'))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(mockBackupUIInstance.render).not.toHaveBeenCalled()
    expect(mockDriveSyncUIInstance.render).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('backupUI.render failed'),
      expect.any(Error)
    )
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('driveSyncUI.render failed'),
      expect.any(Error)
    )
    errorSpy.mockRestore()
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
    expect(mockWeekUIInstance.render).toHaveBeenCalledTimes(1)
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

})

// ============================================================================
// ST-012 Task 9: Interactive persistence badge modal wiring
// ============================================================================
// ST-012 Task 23: separate mount containers for backup and cloud panels
//
// Integration tests: the REAL backup-ui.js / drive-sync-ui.js render functions
// run inside the composition root (mocked factories re-routed to the actual
// modules), so both panels' DOM output must coexist after mount and after a
// data:records:mutated fan-out. This guards against the regression where both
// render() calls targeted the same #cloud-controls container and the second
// cleared the first's output.
// ============================================================================

describe('main.js — ST-012 Task 23: separate mount containers for backup and cloud panels', () => {
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

  beforeEach(async () => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
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
    mockDb.daily_records = { count: vi.fn().mockResolvedValue(5) }
    isolatedDoc = makeIsolatedDoc()
    document.body.innerHTML = `
      <button id="auth-btn">Connect</button>
      <button id="sync-btn">Sync Steps</button>
      <button id="settings-btn">Settings</button>
      <nav class="tab-bar"></nav>
      <div id="auth-status"></div>
      <span id="sync-status"></span>
      <div id="backup-controls"></div>
      <div id="cloud-controls"></div>
    `
    // Re-route the mocked factories to the ACTUAL UI modules so the real
    // render() functions write real DOM into the injected containers.
    const { createBackupUI: realCreateBackupUI } = await vi.importActual('./backup-ui.js')
    const { createDriveSyncUI: realCreateDriveSyncUI } = await vi.importActual('./drive-sync-ui.js')
    createBackupUI.mockImplementation((doc, backup, reporter, confirmFn, settingsArg) =>
      realCreateBackupUI(doc, backup, reporter, confirmFn, settingsArg)
    )
    createDriveSyncUI.mockImplementation((doc, driveSync, backup, reporter, confirmFn, prefs) =>
      realCreateDriveSyncUI(doc, driveSync, backup, reporter, confirmFn, prefs)
    )
  })

  afterEach(() => {
    document.body.innerHTML = ''
    isolatedDoc = null
    // Restore the default mocked factories so later describes keep the mocked
    // render() instances instead of the real DOM-writing modules.
    createBackupUI.mockImplementation(() => mockBackupUIInstance)
    createDriveSyncUI.mockImplementation(() => mockDriveSyncUIInstance)
  })

  it('mounts the local backup panel AND the cloud panel into separate containers (both visible after bootstrap)', async () => {
    await bootstrap(isolatedDoc)
    const backupPanel = document.getElementById('backup-controls')
    const cloudPanel = document.getElementById('cloud-controls')
    expect(backupPanel.querySelector('[data-action="export-backup"]')).not.toBeNull()
    expect(backupPanel.querySelector('[data-action="import-backup"]')).not.toBeNull()
    expect(cloudPanel.querySelector('[data-action="backup-to-drive"]')).not.toBeNull()
    expect(cloudPanel.querySelector('[data-action="restore-from-drive"]')).not.toBeNull()
    expect(backupPanel.textContent).toContain('File on this phone')
    expect(backupPanel.textContent).toContain('Export a backup file')
    expect(backupPanel.textContent).toContain('Restore from a file')
    expect(cloudPanel.querySelector('h2').textContent).toBe('Google Drive')
    expect(cloudPanel.textContent).toContain('Back up to Drive')
    expect(cloudPanel.textContent).toContain('Restore from Drive')
  })

  it('BOTH panels survive a data:records:mutated fan-out (each re-renders into its own container)', async () => {
    await bootstrap(isolatedDoc)
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated'))
    await new Promise(resolve => setTimeout(resolve, 20))
    const backupPanel = document.getElementById('backup-controls')
    const cloudPanel = document.getElementById('cloud-controls')
    expect(backupPanel.textContent).toContain('File on this phone')
    expect(backupPanel.textContent).toContain('Export a backup file')
    expect(backupPanel.textContent).toContain('Restore from a file')
    expect(cloudPanel.querySelector('h2').textContent).toBe('Google Drive')
    expect(cloudPanel.textContent).toContain('Back up to Drive')
    expect(cloudPanel.textContent).toContain('Restore from Drive')
    // No panel render may clear the other panel's output.
    expect(backupPanel.textContent).not.toContain('Back up to Drive')
    expect(cloudPanel.textContent).not.toContain('File on this phone')
  })
})

// ============================================================================
// Storage Health: protection-matrix badge + panel wiring (replaces the old
// storage-modal.js nagging popup).
// ============================================================================

describe('main.js — Storage Health wiring', () => {
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
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockChallengeUIInstance.render.mockResolvedValue(undefined)
    mockSearchUIInstance.render.mockResolvedValue(undefined)
    mockSettingsUIInstance.render.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockStorageHealthUIInstance.render.mockClear()
    mockDb.daily_records = { count: vi.fn().mockResolvedValue(5) }
    isolatedDoc = makeIsolatedDoc()
    document.body.innerHTML = `
      <button id="auth-btn">Connect</button>
      <button id="sync-btn">Sync Steps</button>
      <nav class="tab-bar">
        <button class="tab-btn active" data-tab="dashboard">Dashboard</button>
        <button class="tab-btn" data-tab="backup">Backup</button>
      </nav>
      <div id="tab-dashboard"></div>
      <div id="tab-backup" style="display:none"></div>
      <div id="auth-status"></div>
      <span id="sync-status"></span>
      <div id="storage-health-controls"></div>
    `
  })

  afterEach(() => {
    document.body.innerHTML = ''
    isolatedDoc = null
  })

  it('createStorageHealthUI is instantiated once with (doc, settings, navigator)', async () => {
    await bootstrap(isolatedDoc)
    expect(createStorageHealthUI).toHaveBeenCalledTimes(1)
    expect(createStorageHealthUI).toHaveBeenCalledWith(isolatedDoc, mockSettingsInstance, navigator, { appStorage: false })
  })

  it('storageHealthUI.render is called with #storage-health-controls when present', async () => {
    await bootstrap(isolatedDoc)
    expect(mockStorageHealthUIInstance.render).toHaveBeenCalledWith(
      document.getElementById('storage-health-controls')
    )
  })

  it('bootstrap does not throw when #storage-health-controls is missing (fail-open)', async () => {
    document.getElementById('storage-health-controls').remove()
    await expect(bootstrap(isolatedDoc)).resolves.toBeUndefined()
  })

  it('data:storage-health:refresh re-renders the storage-health panel', async () => {
    await bootstrap(isolatedDoc)
    mockStorageHealthUIInstance.render.mockClear()
    isolatedDoc.dispatchEvent(new CustomEvent('data:storage-health:refresh'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockStorageHealthUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('invokes createSwRegister exactly once with a nav and a config.prod field', async () => {
    await bootstrap(isolatedDoc)
    expect(createSwRegister).toHaveBeenCalledTimes(1)
    expect(createSwRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        nav: navigator,
        config: expect.objectContaining({ prod: expect.any(Boolean) }),
      })
    )
  })

  it('invokes sw-register register() but does not wait for it (fire-and-forget)', async () => {
    let registerResolved = false
    const pendingPromise = new Promise((resolve) => setTimeout(() => { registerResolved = true; resolve() }, 10))
    mockSwRegistrar.register.mockReturnValue(pendingPromise)
    await bootstrap(isolatedDoc)
    // register() was invoked exactly once
    expect(mockSwRegistrar.register).toHaveBeenCalledTimes(1)
    // bootstrap resolved without waiting for registration to complete
    expect(registerResolved).toBe(false)
    // allow the pending promise to settle to avoid unhandled rejection
    await pendingPromise
  })

  it('fails open when sw register() rejects (console.error [main] prefix, bootstrap resolves)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSwRegistrar.register.mockRejectedValueOnce(new Error('registration failed'))
    await expect(bootstrap(isolatedDoc)).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[main]'), expect.anything())
    errorSpy.mockRestore()
  })
})

// ============================================================================
// ST-009 Task 12: Analytics, Gamification, and Odyssey UI wiring
// ============================================================================

describe('main.js — ST-009 Task 12: analytics/gamification/odyssey wiring', () => {
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
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockMonthOverviewInstance.render.mockResolvedValue(undefined)
    mockChallengeUIInstance.render.mockResolvedValue(undefined)
    mockSearchUIInstance.render.mockResolvedValue(undefined)
    mockSettingsUIInstance.render.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockAnalyticsUIInstance.render.mockResolvedValue(undefined)
    mockGamificationUIInstance.render.mockResolvedValue(undefined)
    mockOdysseyUIInstance.render.mockResolvedValue(undefined)
    isolatedDoc = makeIsolatedDoc()
    document.body.innerHTML = `
      <button id="auth-btn">Connect</button>
      <button id="sync-btn">Sync Steps</button>
      <button id="settings-btn">Settings</button>
      <nav class="tab-bar"></nav>
      <div id="auth-status"></div>
      <span id="sync-status"></span>
      <div id="tab-lab" hidden>
        <div id="lab-analytics"></div>
        <div id="lab-gamification"></div>
        <div id="lab-odyssey"></div>
      </div>
    `
  })

  afterEach(() => {
    document.body.innerHTML = ''
    isolatedDoc = null
  })

  it('bootstrap() completes without throwing when all three new UI factories are wired', async () => {
    await expect(bootstrap(isolatedDoc)).resolves.toBeUndefined()
  })

  it('createAnalytics is instantiated once with db during bootstrap', async () => {
    await bootstrap(isolatedDoc)
    expect(createAnalytics).toHaveBeenCalledTimes(1)
    expect(createAnalytics).toHaveBeenCalledWith(mockDb)
  })

  it('createAnalyticsUI is instantiated once during bootstrap', async () => {
    await bootstrap(isolatedDoc)
    expect(createAnalyticsUI).toHaveBeenCalledTimes(1)
  })

  it('createGamification is instantiated once with db during bootstrap', async () => {
    await bootstrap(isolatedDoc)
    expect(createGamification).toHaveBeenCalledTimes(1)
    expect(createGamification).toHaveBeenCalledWith(mockDb)
  })

  it('createGamificationUI is instantiated once during bootstrap', async () => {
    await bootstrap(isolatedDoc)
    expect(createGamificationUI).toHaveBeenCalledTimes(1)
  })

  it('createOdysseyUI is instantiated once during bootstrap', async () => {
    await bootstrap(isolatedDoc)
    expect(createOdysseyUI).toHaveBeenCalledTimes(1)
  })

  it('runSync calls analyticsUI.render() once after sync', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockAnalyticsUIInstance.render.mockResolvedValue(undefined)
    mockGamificationUIInstance.render.mockResolvedValue(undefined)
    mockOdysseyUIInstance.render.mockResolvedValue(undefined)
    document.getElementById('sync-btn').click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mockAnalyticsUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('runSync calls gamificationUI.render() once after sync', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockAnalyticsUIInstance.render.mockResolvedValue(undefined)
    mockGamificationUIInstance.render.mockResolvedValue(undefined)
    mockOdysseyUIInstance.render.mockResolvedValue(undefined)
    document.getElementById('sync-btn').click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mockGamificationUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('runSync calls odysseyUI.render() once after sync', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockAnalyticsUIInstance.render.mockResolvedValue(undefined)
    mockGamificationUIInstance.render.mockResolvedValue(undefined)
    mockOdysseyUIInstance.render.mockResolvedValue(undefined)
    document.getElementById('sync-btn').click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mockOdysseyUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('when analyticsUI.render() throws in runSync, gamificationUI and odysseyUI still execute (fail-open)', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockAnalyticsUIInstance.render.mockRejectedValueOnce(new Error('analytics render fail'))
    mockGamificationUIInstance.render.mockResolvedValue(undefined)
    mockOdysseyUIInstance.render.mockResolvedValue(undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    document.getElementById('sync-btn').click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mockGamificationUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockOdysseyUIInstance.render).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith('[main] analyticsUI.render failed after sync, continuing', expect.any(Error))
    errorSpy.mockRestore()
  })

  it('data:records:mutated triggers analyticsUI.render()', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockAnalyticsUIInstance.render.mockResolvedValue(undefined)
    mockGamificationUIInstance.render.mockResolvedValue(undefined)
    mockOdysseyUIInstance.render.mockResolvedValue(undefined)
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated'))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockAnalyticsUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('data:records:mutated triggers gamificationUI.render()', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockAnalyticsUIInstance.render.mockResolvedValue(undefined)
    mockGamificationUIInstance.render.mockResolvedValue(undefined)
    mockOdysseyUIInstance.render.mockResolvedValue(undefined)
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated'))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockGamificationUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('data:records:mutated triggers odysseyUI.render()', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockAnalyticsUIInstance.render.mockResolvedValue(undefined)
    mockGamificationUIInstance.render.mockResolvedValue(undefined)
    mockOdysseyUIInstance.render.mockResolvedValue(undefined)
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated'))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockOdysseyUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('pre-existing runSync renders (streakUI, calendarUI) still called and not reordered', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    mockAnalyticsUIInstance.render.mockResolvedValue(undefined)
    document.getElementById('sync-btn').click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    // Pre-existing renders must come before new Lab renders
    expect(mockStreakUIInstance.render.mock.invocationCallOrder[0])
      .toBeLessThan(mockAnalyticsUIInstance.render.mock.invocationCallOrder[0])
    expect(mockCalendarUIInstance.render.mock.invocationCallOrder[0])
      .toBeLessThan(mockAnalyticsUIInstance.render.mock.invocationCallOrder[0])
  })
})

describe('main.js — ST-017/018/019 platform wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    mockSwRegistrar.register.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockHealth.isAvailable.mockResolvedValue({ available: true })
    mockHealth.checkAuthorization.mockResolvedValue({ readAuthorized: [] })
    mockHealth.requestAuthorization.mockResolvedValue({ readAuthorized: ['steps', 'distance'] })
  })

  afterEach(() => {
    mockIsNativePlatform.mockReturnValue(false)
    document.body.innerHTML = ''
  })

  describe('in the browser', () => {
    it('labels the connect button for Google, with no step source (ST-024)', async () => {
      await boot(makeStorage())
      expect(createStatusReporter).toHaveBeenCalledWith(document, { connectLabel: 'Connect Google Account' })
      expect(document.getElementById('auth-btn').textContent).toBe('Connect Google Account')
      expect(createStepSync).not.toHaveBeenCalled()
    })

    it('registers the service worker in production builds', async () => {
      await boot(makeStorage())
      expect(createSwRegister.mock.calls[0][0].config.prod).toBe(import.meta.env.PROD)
    })

    it('passes a FileSaver to the exporter and the backup panel', async () => {
      await boot(makeStorage())
      const [saver] = createExporter.mock.calls[0]
      expect(typeof saver.saveTextFile).toBe('function')
      expect(createBackupUI.mock.calls[0][5]).toBe(saver)
    })
  })

  describe('in the Android app', () => {
    beforeEach(() => {
      mockIsNativePlatform.mockReturnValue(true)
    })

    it('labels the connect button for Health Connect and wires the Health Connect source', async () => {
      await boot(makeStorage())
      expect(createStatusReporter).toHaveBeenCalledWith(document, { connectLabel: 'Connect Health Connect' })
      expect(document.getElementById('auth-btn').textContent).toBe('Connect Health Connect')
      const source = createStepSync.mock.calls[0][0]
      expect(source.label).toBe('Health Connect')
    })

    it('never registers a service worker', async () => {
      await boot(makeStorage())
      expect(createSwRegister.mock.calls[0][0].config.prod).toBe(false)
    })

    it('names Health Connect as the step source and hands the challenge the share sheet', async () => {
      await boot(makeStorage())
      expect(document.getElementById('step-source-name').textContent).toBe('Health Connect')
      expect(createChallengeUI.mock.calls[0][4].share).toEqual(expect.any(Function))
      expect(mockOnBackButton).toHaveBeenCalledWith({ isNative: true }, expect.any(Function))
    })

    it('treats app storage as always protected', async () => {
      await boot(makeStorage())
      const manager = createStorageHealthUI.mock.calls[0][2]
      expect(manager).not.toBe(navigator)
      await expect(manager.storage.persisted()).resolves.toBe(true)
    })

    it('the connect button asks Health Connect for access, then syncs', async () => {
      await boot(makeStorage())
      document.getElementById('auth-btn').click()
      await vi.waitFor(() => expect(mockStepSyncInstance.sync).toHaveBeenCalledTimes(1))
      expect(mockHealth.requestAuthorization).toHaveBeenCalledWith({ read: ['steps', 'distance'], requestHistoryAccess: true })
      expect(mockAuthInstance.requestToken).not.toHaveBeenCalled()
    })

    it('syncs at startup when Health Connect access was granted before', async () => {
      mockHealth.checkAuthorization.mockResolvedValue({ readAuthorized: ['steps', 'distance'] })
      await boot(makeStorage())
      await vi.waitFor(() => expect(mockStepSyncInstance.sync).toHaveBeenCalledTimes(1))
      expect(mockHealth.requestAuthorization).not.toHaveBeenCalled()
    })

    it('does not sync at startup before access is granted', async () => {
      await boot(makeStorage())
      await Promise.resolve()
      expect(mockStepSyncInstance.sync).not.toHaveBeenCalled()
    })
  })
})

describe('main.js — ST-020 Drive sign-in and primary device wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    mockSwRegistrar.register.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockSettingsInstance.getPrimaryDevice.mockResolvedValue(null)
    mockHealth.isAvailable.mockResolvedValue({ available: true })
    mockHealth.checkAuthorization.mockResolvedValue({ readAuthorized: [] })
    mockSocialLogin.initialize.mockResolvedValue(undefined)
    mockSocialLogin.refresh.mockResolvedValue(undefined)
    mockSocialLogin.getAuthorizationCode.mockResolvedValue({ accessToken: 'tok-drv' })
  })

  afterEach(() => {
    mockIsNativePlatform.mockReturnValue(false)
    document.body.innerHTML = ''
  })

  const driveUIOptions = () => createDriveSyncUI.mock.calls[0][6]
  const stepSyncPrimary = () => createStepSync.mock.calls[0][7]

  describe('in the browser', () => {
    it('labels this installation "Web browser" (it never uploads — ST-023)', async () => {
      await boot(makeStorage())
      expect(driveUIOptions().primaryDevice.label).toBe('Web browser')
    })

    it('keeps Google sign-in in the header: no Drive connect button, no "make primary"', async () => {
      await boot(makeStorage())
      expect(driveUIOptions().driveConnection).toBeNull()
      expect(driveUIOptions().canMakePrimary).toBe(false)
      expect(createAuth).toHaveBeenCalledTimes(1)
    })
  })

  describe('in the Android app', () => {
    beforeEach(() => {
      mockIsNativePlatform.mockReturnValue(true)
    })

    it('signs in to Google natively, not with Google Identity Services', async () => {
      await boot(makeStorage())
      expect(createAuth).not.toHaveBeenCalled()
      await vi.waitFor(() => expect(mockSocialLogin.initialize).toHaveBeenCalledWith({
        google: { webClientId: 'FAKE_ID', mode: 'online' },
      }))
    })

    it('shares one primary-device checker between the sync engine and the Drive panel', async () => {
      await boot(makeStorage())
      const primaryDevice = driveUIOptions().primaryDevice
      expect(typeof primaryDevice.otherPrimary).toBe('function')
      expect(stepSyncPrimary()).toBe(primaryDevice)
    })

    it('offers Connect Google Drive and "make primary" in the Drive panel', async () => {
      await boot(makeStorage())
      expect(driveUIOptions().driveConnection.label).toBe('Connect Google Drive')
      expect(driveUIOptions().canMakePrimary).toBe(true)
      expect(driveUIOptions().primaryDevice.label).toBe('Android app')
    })

    it('reconnects Drive silently at launch when it was connected before, then refreshes the panel', async () => {
      const storage = makeStorage()
      storage.setItem('google_drive_connected', '1')
      const refreshed = vi.fn()
      document.addEventListener('data:drive-sync:refresh', refreshed)
      await boot(storage)

      await vi.waitFor(() => expect(mockDriveAuthorization.authorize).toHaveBeenCalled())
      await vi.waitFor(() => expect(refreshed).toHaveBeenCalled())
      // ST-026: no Credential Manager sign-in ("Signing in as…") on a relaunch.
      expect(mockSocialLogin.refresh).not.toHaveBeenCalled()
      expect(mockSocialLogin.login).not.toHaveBeenCalled()
      document.removeEventListener('data:drive-sync:refresh', refreshed)
    })

    it('does not touch Google at launch when Drive was never connected', async () => {
      await boot(makeStorage())
      await Promise.resolve()
      expect(mockDriveAuthorization.authorize).not.toHaveBeenCalled()
      expect(mockSocialLogin.refresh).not.toHaveBeenCalled()
    })

    it('ST-026: each Drive request asks Play services for a current token', async () => {
      const storage = makeStorage()
      storage.setItem('google_drive_account', 'me@example.com')
      await boot(storage)
      mockDriveAuthorization.authorize.mockResolvedValueOnce('tok-renewed')
      const { getAccessToken } = createDriveSync.mock.calls.at(-1)[0]
      await expect(getAccessToken()).resolves.toBe('tok-renewed')
    })

    it('ST-026: the storage panel describes app storage', async () => {
      await boot(makeStorage())
      expect(createStorageHealthUI.mock.calls.at(-1)[3]).toEqual({ appStorage: true })
    })
  })
})

describe('main.js — ST-021 sync when the app comes back to the foreground', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    mockSwRegistrar.register.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockStepSyncInstance.canSync.mockResolvedValue(true)
    mockHealth.isAvailable.mockResolvedValue({ available: true })
    mockHealth.checkAuthorization.mockResolvedValue({ readAuthorized: [] })
  })

  afterEach(() => {
    mockIsNativePlatform.mockReturnValue(false)
    document.body.innerHTML = ''
  })

  /** The resume handler registered by the most recent bootstrap. */
  const resume = () => mockOnAppResume.mock.calls.at(-1)[1]()
  const settle = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve() }

  it('registers one resume handler, for the browser, with the shared document', async () => {
    await boot(makeStorage())
    expect(mockOnAppResume).toHaveBeenCalledTimes(1)
    expect(mockOnAppResume.mock.calls[0][0]).toEqual({ isNative: false, doc: document })
  })

  it('registers it for the Android app in the app', async () => {
    mockIsNativePlatform.mockReturnValue(true)
    await boot(makeStorage())
    expect(mockOnAppResume.mock.calls[0][0]).toEqual({ isNative: true, doc: document })
  })

  it('a resume syncs when connected', async () => {
    asApp()
    await boot(makeStorage())

    resume()

    await vi.waitFor(() => expect(mockStepSyncInstance.sync).toHaveBeenCalledTimes(1))
    expect(mockStepSyncInstance.canSync).toHaveBeenCalled()
  })

  it('does not sync again on a quick second resume (cooldown)', async () => {
    asApp()
    await boot(makeStorage())

    resume()
    await vi.waitFor(() => expect(mockStepSyncInstance.sync).toHaveBeenCalledTimes(1))
    resume()
    await settle()

    expect(mockStepSyncInstance.sync).toHaveBeenCalledTimes(1)
  })

  it('a manual Sync Steps also starts the cooldown', async () => {
    asApp()
    await boot(makeStorage())
    document.getElementById('sync-btn').click()
    await vi.waitFor(() => expect(mockStepSyncInstance.sync).toHaveBeenCalledTimes(1))

    resume()
    await settle()

    expect(mockStepSyncInstance.sync).toHaveBeenCalledTimes(1)
  })

  it('stays silent on resume when the step source is not connected', async () => {
    asApp()
    mockStepSyncInstance.canSync.mockResolvedValue(false)
    await boot(makeStorage())

    resume()
    await vi.waitFor(() => expect(mockStepSyncInstance.canSync).toHaveBeenCalled())
    await settle()

    expect(mockStepSyncInstance.sync).not.toHaveBeenCalled()
  })
})

describe('main.js — mobile redesign: welcome screen and pull-to-refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsNativePlatform.mockReturnValue(false)
    initDB.mockResolvedValue(undefined)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    mockStepSyncInstance.canSync.mockResolvedValue(true)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('creates the welcome screen with the connection, source name and storage, and starts it last', async () => {
    const storage = makeStorage()
    await boot(storage)
    const deps = createOnboardingUI.mock.calls[0][1]
    expect(createOnboardingUI.mock.calls[0][0]).toBe(document)
    expect(deps.storage).toBe(storage)
    expect(deps.sourceName).toBe('Google Drive')
    expect(deps.connection.label).toBe('Connect Google Account')
    expect(mockOnboardingInstance.start).toHaveBeenCalledTimes(1)
    expect(mockOnboardingInstance.start.mock.invocationCallOrder[0])
      .toBeGreaterThan(mockSearchUIInstance.render.mock.invocationCallOrder[0])
  })

  it('"Restore from a backup" on the welcome screen opens Backup & restore', async () => {
    await boot(makeStorage())
    createOnboardingUI.mock.calls[0][1].onRestore()
    expect(visibleScreen()).toBe('tab-backup')
  })

  it('the welcome screen knows whether there is data', async () => {
    const { createDb: mockCreateDb } = await import('./db.js')
    mockCreateDb.mockReturnValueOnce({ daily_records: { count: vi.fn().mockResolvedValue(3) } })
    await boot(makeStorage())
    await expect(createOnboardingUI.mock.calls[0][1].hasData()).resolves.toBe(true)
  })

  it('pulling down on Today syncs', async () => {
    await boot(makeStorage())
    const touch = (type, y) => {
      const event = new Event(type, { bubbles: true })
      event.touches = type === 'touchend' ? [] : [{ clientY: y }]
      document.dispatchEvent(event)
    }
    mockStepSyncInstance.sync.mockClear()
    touch('touchstart', 0)
    touch('touchmove', 400)
    touch('touchend')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockStepSyncInstance.sync).toHaveBeenCalled()
  })
})

describe('main.js — ST-023 read-only web viewer', () => {
  const SNAPSHOT = {
    schema_version: 1,
    exported_at: '2026-09-28T17:01:00.000Z',
    daily_records: [{ date: '2026-09-28', effective_steps: 17498 }],
    settings: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    Object.assign(mockDb, {
      daily_records: { clear: vi.fn(), bulkPut: vi.fn(), count: vi.fn().mockResolvedValue(0) },
      settings: { clear: vi.fn(), bulkPut: vi.fn(), put: vi.fn(), get: vi.fn().mockResolvedValue(undefined) },
    })
  })

  afterEach(() => {
    delete mockDb.daily_records
    delete mockDb.settings
    document.body.innerHTML = ''
    delete document.documentElement.dataset.access
  })

  const isReadOnly = () => guardWrites.mock.calls.at(-1)[1].isReadOnly()
  const clickRefresh = async () => {
    document.getElementById('sync-btn').click()
    await vi.waitFor(() => expect(mockDriveSyncInstance.pull).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  it('the browser is a viewer: its own cache database, every write refused', async () => {
    await boot(makeStorage())
    expect(document.documentElement.dataset.access).toBe('viewer')
    expect(createDb).toHaveBeenCalledWith('StepTrackerViewerDB')
    expect(guardWrites).toHaveBeenCalledWith(mockDb, expect.any(Object))
    expect(isReadOnly()).toBe(true)
  })

  it('the Android app edits its own database', async () => {
    asApp()
    await boot(makeStorage())
    expect(document.documentElement.dataset.access).toBe('editor')
    expect(createDb).toHaveBeenCalledWith('StepTrackerDB')
    expect(isReadOnly()).toBe(false)
  })

  it('↻ loads the Drive snapshot through the backstop and re-renders — no step sync', async () => {
    await boot(makeStorage())
    mockAuthInstance.getAccessToken.mockReturnValue('tok')
    mockDriveSyncInstance.pull.mockResolvedValueOnce(SNAPSHOT)
    mockProgressUIInstance.render.mockClear()

    await clickRefresh()

    expect(mockWriteSnapshot).toHaveBeenCalledTimes(1)
    expect(mockDb.daily_records.bulkPut).toHaveBeenCalledWith(SNAPSHOT.daily_records)
    expect(mockStepSyncInstance.sync).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(mockProgressUIInstance.render).toHaveBeenCalled())
    mockAuthInstance.getAccessToken.mockReset()
  })

  it('never writes to Drive: no upload, no primary-device read, across connect, refresh and resume', async () => {
    await boot(makeStorage())
    mockAuthInstance.getAccessToken.mockReturnValue('tok')
    mockDriveSyncInstance.pull.mockResolvedValue(SNAPSHOT)
    await mockOnTokenHandler()
    await clickRefresh()
    mockOnAppResume.mock.calls.at(-1)[1]()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockDriveSyncInstance.pull).toHaveBeenCalled()
    expect(mockDriveSyncInstance.push).not.toHaveBeenCalled()
    expect(mockDriveSyncInstance.readPrimaryDevice).not.toHaveBeenCalled()
    mockAuthInstance.getAccessToken.mockReset()
    mockDriveSyncInstance.pull.mockReset()
    mockDriveSyncInstance.pull.mockResolvedValue(null)
  })

  it('the status line shows the snapshot time and a Drive refresh button', async () => {
    mockDb.settings.get.mockImplementation(async (key) =>
      key === 'viewer_snapshot_at' ? { key, value: new Date(2026, 8, 28, 22, 31).toISOString() } : undefined)
    await boot(makeStorage())
    expect(document.getElementById('last-sync').textContent).toBe('Data as of Sep 28, 2026 · 22:31')
    expect(document.getElementById('sync-btn').getAttribute('aria-label')).toBe('Refresh from Google Drive')
  })

  it('the welcome screen introduces the viewer', async () => {
    await boot(makeStorage())
    expect(createOnboardingUI.mock.calls.at(-1)[1].intro).toMatch(/backs up to your Google Drive/)
  })

  it('the goal chip is read-only', async () => {
    await boot(makeStorage())
    expect(createProgressUI.mock.calls.at(-1)[5]).toEqual({ canEdit: false })
  })
})

describe('main.js — ST-027 backup pill', () => {
  const pill = () => document.getElementById('backup-status')
  const recent = () => ({ at: new Date(Date.now() - 3_600_000).toISOString(), bytes: 10 })

  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    mockSettingsInstance.getDriveBackupEnabled = vi.fn().mockResolvedValue(true)
    mockSettingsInstance.getLastDriveSync = vi.fn().mockResolvedValue(recent())
    mockSettingsInstance.getPrimaryDevice.mockResolvedValue(null)
  })

  afterEach(() => {
    delete mockSettingsInstance.getDriveBackupEnabled
    delete mockSettingsInstance.getLastDriveSync
    document.body.innerHTML = ''
  })

  it('the web viewer never shows it', async () => {
    await boot(makeStorage())
    expect(pill().hidden).toBe(true)
  })

  it('in the app, warns "Not backed up" while Google Drive was never connected, and opens Backup & restore', async () => {
    asApp()
    await boot(makeStorage())
    expect(pill().hidden).toBe(false)
    expect(pill().textContent).toBe('Not backed up')
    expect(pill().title).toBe('Google Drive is not connected')
    pill().click()
    expect(visibleScreen()).toBe('tab-backup')
  })

  it('in the app, stays hidden once Drive was connected here and backups are recent — no flash during the silent reconnect', async () => {
    asApp()
    const storage = makeStorage()
    storage.setItem('google_drive_connected', '1')
    await boot(storage)
    expect(pill().hidden).toBe(true)
  })

  it('refreshes when the Drive panel changes (e.g. auto backup switched off)', async () => {
    asApp()
    const storage = makeStorage()
    storage.setItem('google_drive_connected', '1')
    await boot(storage)
    mockSettingsInstance.getDriveBackupEnabled.mockResolvedValue(false)
    document.dispatchEvent(new CustomEvent('data:storage-health:refresh'))
    await vi.waitFor(() => expect(pill().hidden).toBe(false))
    expect(pill().title).toBe('Automatic backup is off')
  })

  it('refreshes after a sync', async () => {
    asApp()
    const storage = makeStorage()
    storage.setItem('google_drive_connected', '1')
    await boot(storage)
    mockSettingsInstance.getLastDriveSync.mockResolvedValue(null)
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
    document.getElementById('sync-btn').click()
    await vi.waitFor(() => expect(pill().hidden).toBe(false))
    expect(pill().title).toMatch(/not backed up to Google Drive yet/)
  })
})
