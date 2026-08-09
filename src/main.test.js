import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

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

// Import mocked modules so we have references to the spy fns
import { createStatusReporter } from './ui-status.js'
import { createDb, initDB } from './db.js'
import { requestPersistentStorage } from './storage.js'
import { createAuth } from './auth.js'
import { initTabs } from './tabs.js'

// Import main — registers the DOMContentLoaded listener once
import './main.js'

// Helper: set up DOM, fire DOMContentLoaded, flush promises
async function boot() {
  document.body.innerHTML = `
    <button id="auth-btn">Connect</button>
    <nav class="tab-bar"></nav>
    <div id="db-status"></div>
    <div id="auth-status"></div>
  `
  document.dispatchEvent(new Event('DOMContentLoaded'))
  // Flush microtasks (two ticks to cover chained awaits)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
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
    document.dispatchEvent(new Event('DOMContentLoaded'))
    await new Promise(r => setTimeout(r, 50))

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

describe('main.js — no getElementById in collaborators (regression)', () => {
  it('db.js does not call getElementById directly', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.resolve(__dirname, 'db.js'), 'utf8')
    expect(src).not.toContain('getElementById')
  })

  it('storage.js does not call getElementById directly', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.resolve(__dirname, 'storage.js'), 'utf8')
    expect(src).not.toContain('getElementById')
  })

  it('auth.js does not call getElementById directly', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.resolve(__dirname, 'auth.js'), 'utf8')
    expect(src).not.toContain('getElementById')
  })
})
