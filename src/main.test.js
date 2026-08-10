import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// All vi.mock calls are hoisted — they run before any imports
vi.mock('./config.js', () => ({ CLIENT_ID: 'FAKE_ID' }))

const mockReporter = { db: vi.fn(), auth: vi.fn() }
vi.mock('./ui-status.js', () => ({
  createStatusReporter: vi.fn(() => mockReporter)
}))

const mockDb = {}
vi.mock('./db.js', () => ({
  createDb: vi.fn(() => mockDb),
  initDB: vi.fn(() => Promise.resolve()),
  DB_NAME: 'StepTrackerDB',
  DB_VERSION: 1
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
import { createStatusReporter } from './ui-status.js'
import { createDb, initDB } from './db.js'
import { requestPersistentStorage } from './storage.js'
import { createAuth } from './auth.js'
import { initTabs } from './tabs.js'
import { createStepSync } from './steps.js'

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

  it('main.js source does not directly mutate #sync-btn state (no disabled set, no label swap)', () => {
    const source = readFileSync(resolve(process.cwd(), 'src', 'main.js'), 'utf8')
    expect(source).not.toContain('sync-btn.disabled')
    expect(source).not.toContain('disabled =')
    expect(source).not.toContain('Syncing')
  })

  it('bootstrap() does not throw when #sync-btn is missing (fail-open)', async () => {
    document.body.innerHTML = `
      <button id="auth-btn">Connect</button>
      <nav class="tab-bar"></nav>
    `
    await expect(bootstrap(document)).resolves.toBeUndefined()
    expect(createStepSync).toHaveBeenCalledTimes(1)
  })

  it('the single shared reporter is passed to createStepSync as well', async () => {
    await boot()
    expect(createStepSync).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      mockReporter,
      expect.anything()
    )
  })
})
