import { describe, it, expect, vi, afterEach } from 'vitest';
import { DB_NAME, DB_VERSION, createDb, initDB } from './db.js';

// We mock Dexie so that `new Dexie(...)` returns a controllable object.
// The mock factory must export a class-like constructor.
vi.mock('dexie', async () => {
  const storesFn = vi.fn().mockReturnThis();
  const upgradeFn = vi.fn();
  const versionFn = vi.fn().mockReturnValue({ stores: storesFn, upgrade: upgradeFn });

  class MockDexie {
    constructor(name) {
      this._name = name;
      this.version = versionFn;
      this.open = vi.fn().mockResolvedValue(undefined);
      this.daily_records = { count: vi.fn().mockResolvedValue(0) };
      MockDexie._lastInstance = this;
    }
  }
  MockDexie._lastInstance = null;
  return { default: MockDexie };
});

function makeMockDb({ openRejects = false, count = 0 } = {}) {
  return {
    open: openRejects
      ? vi.fn().mockRejectedValue(new Error('open failed'))
      : vi.fn().mockResolvedValue(undefined),
    daily_records: { count: vi.fn().mockResolvedValue(count) },
    version: vi.fn().mockReturnValue({ stores: vi.fn().mockReturnThis() }),
  };
}

function makeReporter() {
  return { db: vi.fn(), auth: vi.fn() };
}

afterEach(() => vi.restoreAllMocks());

describe('DB constants', () => {
  it('DB_NAME equals StepTrackerDB', () => {
    expect(DB_NAME).toBe('StepTrackerDB');
  });
  it('DB_VERSION equals 2', () => {
    expect(DB_VERSION).toBe(2);
  });
});

describe('createDb()', () => {
  it('calls Dexie constructor with StepTrackerDB', async () => {
    const { default: MockDexie } = await import('dexie');
    const db = createDb();
    expect(db._name).toBe('StepTrackerDB');
  });

  it('calls version(2)', async () => {
    const db = createDb();
    expect(db.version).toHaveBeenCalledWith(2);
  });

  it('calls stores with correct daily_records index string', async () => {
    const db = createDb();
    const storesSpy = db.version.mock.results[0].value.stores;
    expect(storesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        daily_records: 'date,effective_steps,effective_distance_km,is_overridden,synced_at',
      })
    );
  });

  it('calls stores with goal_history index string', async () => {
    const db = createDb();
    const storesSpy = db.version.mock.results[0].value.stores;
    expect(storesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        goal_history: 'effective_from,target_distance_km,target_steps',
      })
    );
  });
});

describe('createDb() — upgrade handler', () => {
  function getHandler(db) {
    const upgradeSpy = db.version.mock.results.at(-1).value.upgrade;
    return upgradeSpy.mock.calls.at(-1)[0];
  }

  it('registers upgrade as a function', () => {
    const db = createDb();
    const upgradeSpy = db.version.mock.results.at(-1).value.upgrade;
    expect(upgradeSpy).toHaveBeenCalled();
    expect(typeof upgradeSpy.mock.calls.at(-1)[0]).toBe('function');
  });

  it('seeds goal_history.put with the three fields from a valid active_goal', async () => {
    const db = createDb();
    const handler = getHandler(db);
    const putFn = vi.fn().mockResolvedValue(undefined);
    const tx = {
      table: (name) =>
        name === 'settings'
          ? { get: vi.fn().mockResolvedValue({ effective_from: '2024-01-01', target_distance_km: 5.0, target_steps: 6500 }) }
          : { put: putFn },
    };
    await handler(tx);
    expect(putFn).toHaveBeenCalledTimes(1);
    expect(putFn).toHaveBeenCalledWith({ effective_from: '2024-01-01', target_distance_km: 5.0, target_steps: 6500 });
  });

  it('seeds nothing when settings.active_goal is absent (undefined)', async () => {
    const db = createDb();
    const handler = getHandler(db);
    const putFn = vi.fn();
    const tx = {
      table: (name) =>
        name === 'settings'
          ? { get: vi.fn().mockResolvedValue(undefined) }
          : { put: putFn },
    };
    await handler(tx);
    expect(putFn).not.toHaveBeenCalled();
  });

  it('seeds nothing when active_goal has non-finite target_distance_km', async () => {
    const db = createDb();
    const handler = getHandler(db);
    const putFn = vi.fn();
    const tx = {
      table: (name) =>
        name === 'settings'
          ? { get: vi.fn().mockResolvedValue({ effective_from: '2024-01-01', target_distance_km: NaN, target_steps: 6500 }) }
          : { put: putFn },
    };
    await handler(tx);
    expect(putFn).not.toHaveBeenCalled();
  });

  it('resolves without throwing when settings.get() rejects (fail-open)', async () => {
    const db = createDb();
    const handler = getHandler(db);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const tx = { table: () => ({ get: vi.fn().mockRejectedValue(new Error('read failed')) }) };
    await expect(handler(tx)).resolves.toBeUndefined();
  });

  it('logs [db] to console.error when the upgrade throws', async () => {
    const db = createDb();
    const handler = getHandler(db);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tx = { table: () => ({ get: vi.fn().mockRejectedValue(new Error('read failed')) }) };
    await handler(tx);
    expect(spy.mock.calls[0][0]).toBe('[db]');
  });
});

describe('initDB() - happy path', () => {
  it('calls db.open() once', async () => {
    const db = makeMockDb();
    await initDB(db, makeReporter());
    expect(db.open).toHaveBeenCalledTimes(1);
  });

  it('reporter.db called with ready string when count is 0', async () => {
    const db = makeMockDb({ count: 0 });
    const reporter = makeReporter();
    await initDB(db, reporter);
    expect(reporter.db).toHaveBeenCalledWith('✅ DB ready (0 records)');
  });

  it('reporter.db called with ready string when count is 5', async () => {
    const db = makeMockDb({ count: 5 });
    const reporter = makeReporter();
    await initDB(db, reporter);
    expect(reporter.db).toHaveBeenCalledWith('✅ DB ready (5 records)');
  });
});

describe('initDB() - error path', () => {
  it('reporter.db receives ❌ DB init failed when open rejects', async () => {
    const db = makeMockDb({ openRejects: true });
    const reporter = makeReporter();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await initDB(db, reporter);
    expect(reporter.db).toHaveBeenCalledWith('❌ DB init failed');
  });

  it('console.error called with [initDB] prefix when open rejects', async () => {
    const db = makeMockDb({ openRejects: true });
    const reporter = makeReporter();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await initDB(db, reporter);
    expect(spy.mock.calls[0][0]).toContain('[initDB]');
  });

  it('initDB resolves (does not reject) when open rejects', async () => {
    const db = makeMockDb({ openRejects: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(initDB(db, makeReporter())).resolves.toBeUndefined();
  });
});

describe('initDB() - edge case', () => {
  it('resolves and calls reporter even when count() rejects', async () => {
    const db = {
      open: vi.fn().mockResolvedValue(undefined),
      daily_records: { count: vi.fn().mockRejectedValue(new Error('count failed')) },
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reporter = makeReporter();
    await expect(initDB(db, reporter)).resolves.toBeUndefined();
    expect(reporter.db).toHaveBeenCalled();
  });
});
