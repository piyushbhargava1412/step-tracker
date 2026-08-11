import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// All vi.mock calls are hoisted — they run before any imports
vi.mock('./config.js', () => ({ CLIENT_ID: 'FAKE_ID' }))

// Task 5: mock records.js and image-processor.js
const mockRecordsInstance = { overrideRecord: vi.fn().mockResolvedValue(undefined), revertRecord: vi.fn().mockResolvedValue(undefined) }
vi.mock('./records.js', () => ({
  createRecords: vi.fn(() => mockRecordsInstance)
}))

vi.mock('./image-processor.js', () => ({
  processImage: vi.fn().mockResolvedValue('data:image/jpeg;base64,abc')
}))

// Task 6: mock goal.js and progress-ui.js
const mockGoalInstance = { getActiveGoal: vi.fn(), setActiveGoal: vi.fn() }
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

const mockAuthInstance = {
  init: vi.fn(),
  requestToken: vi.fn(),
  getAccessToken: vi.fn()
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

// Import bootstrap directly — cleaner than dispatching DOMContentLoaded
import { bootstrap } from './main.js'

// Helper: set up DOM and call bootstrap directly
async function boot() {
  document.body.innerHTML = `
    <button id="auth-btn">Connect</button>
    <button id="sync-btn">Sync Steps</button>
    <nav class="tab-bar"></nav>
    <div id="db-status"></div>
    <div id="auth-status"></div>
    <span id="sync-status"></span>
  `
  await bootstrap(document)
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

describe('main.js — Task 6: composition-root wiring (createGoal + createProgressUI + render)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initDB.mockResolvedValue(undefined)
    requestPersistentStorage.mockResolvedValue(undefined)
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
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
    mockStepSyncInstance.sync.mockResolvedValue(undefined)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('createStreak is invoked exactly once with mockDb', async () => {
    await boot()
    expect(createStreak).toHaveBeenCalledTimes(1)
    expect(createStreak).toHaveBeenCalledWith(mockDb)
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
    expect(createCalendarUI).toHaveBeenCalledWith(document, mockDb, mockCalendarInstance, mockReporter, mockRecordsInstance, expect.any(Function))
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

  it('data:records:mutated dispatch triggers progressUI.render, streakUI.render, calendarUI.render in order', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated', { detail: { date: '2026-08-11' } }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mockProgressUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockProgressUIInstance.render.mock.invocationCallOrder[0]).toBeLessThan(mockStreakUIInstance.render.mock.invocationCallOrder[0])
    expect(mockStreakUIInstance.render.mock.invocationCallOrder[0]).toBeLessThan(mockCalendarUIInstance.render.mock.invocationCallOrder[0])
  })

  it('progressUI.render rejection inside mutation handler does not propagate (fail-open); streakUI and calendarUI still called', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockProgressUIInstance.render.mockRejectedValueOnce(new Error('progress fail'))
    mockStreakUIInstance.render.mockResolvedValue(undefined)
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated', { detail: { date: '2026-08-11' } }))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockStreakUIInstance.render).toHaveBeenCalledTimes(1)
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
  })

  it('streakUI.render rejection inside mutation handler does not propagate; calendarUI still called', async () => {
    await bootstrap(isolatedDoc)
    vi.clearAllMocks()
    mockProgressUIInstance.render.mockResolvedValue(undefined)
    mockStreakUIInstance.render.mockRejectedValueOnce(new Error('streak fail'))
    mockCalendarUIInstance.render.mockResolvedValue(undefined)
    isolatedDoc.dispatchEvent(new CustomEvent('data:records:mutated', { detail: '2026-08-11' }))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockCalendarUIInstance.render).toHaveBeenCalledTimes(1)
  })
})
