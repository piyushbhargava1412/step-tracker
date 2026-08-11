import { describe, it, expect, vi, afterEach } from 'vitest';
import { DB_NAME, DB_VERSION, createDb, initDB } from './db.js';

// We mock Dexie so that `new Dexie(...)` returns a controllable object.
// Each call to version() returns a fresh chainable object so v2 and v3
// upgrade handlers can be retrieved independently.
vi.mock('dexie', async () => {
  class MockDexie {
    constructor(name) {
      this._name = name;
      this.version = vi.fn().mockImplementation(() => {
        const chain = {
          stores: vi.fn().mockReturnThis(),
          upgrade: vi.fn().mockReturnThis(),
        };
        return chain;
      });
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

// ─── DB constants ─────────────────────────────────────────────────────────────

describe('DB constants', () => {
  it('DB_NAME equals StepTrackerDB', () => {
    expect(DB_NAME).toBe('StepTrackerDB');
  });
  it('DB_VERSION equals 3', () => {
    expect(DB_VERSION).toBe(3);
  });
});

// ─── createDb() ───────────────────────────────────────────────────────────────

describe('createDb()', () => {
  it('calls Dexie constructor with StepTrackerDB', async () => {
    const db = createDb();
    expect(db._name).toBe('StepTrackerDB');
  });

  it('calls version(2)', async () => {
    const db = createDb();
    expect(db.version).toHaveBeenCalledWith(2);
  });

  it('calls stores with correct daily_records index string (v2)', async () => {
    const db = createDb();
    const v2Chain = db.version.mock.results[0].value;
    expect(v2Chain.stores).toHaveBeenCalledWith(
      expect.objectContaining({
        daily_records: 'date,effective_steps,effective_distance_km,is_overridden,synced_at',
      })
    );
  });

  it('calls stores with goal_history index string (v2)', async () => {
    const db = createDb();
    const v2Chain = db.version.mock.results[0].value;
    expect(v2Chain.stores).toHaveBeenCalledWith(
      expect.objectContaining({
        goal_history: 'effective_from,target_distance_km,target_steps',
      })
    );
  });
});

// ─── v2 upgrade handler ───────────────────────────────────────────────────────

describe('createDb() — v2 upgrade handler', () => {
  function getV2Handler(db) {
    const upgradeSpy = db.version.mock.results[0].value.upgrade;
    return upgradeSpy.mock.calls[0][0];
  }

  it('registers upgrade as a function', () => {
    const db = createDb();
    const upgradeSpy = db.version.mock.results[0].value.upgrade;
    expect(upgradeSpy).toHaveBeenCalled();
    expect(typeof upgradeSpy.mock.calls[0][0]).toBe('function');
  });

  it('seeds goal_history.put with the three fields from a valid active_goal', async () => {
    const db = createDb();
    const handler = getV2Handler(db);
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
    const handler = getV2Handler(db);
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
    const handler = getV2Handler(db);
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

  it.each([
    { target_distance_km: 5, target_steps: 0 },
    { target_distance_km: 5, target_steps: NaN },
    { target_distance_km: 0, target_steps: 6500 },
  ])('seeds nothing for invalid goal values', async (row) => {
    const db = createDb();
    const handler = getV2Handler(db);
    const putFn = vi.fn();
    const tx = {
      table: (name) => name === 'settings'
        ? { get: vi.fn().mockResolvedValue({ effective_from: '2024-01-01', ...row }) }
        : { put: putFn },
    };
    await expect(handler(tx)).resolves.toBeUndefined();
    expect(putFn).not.toHaveBeenCalled();
  });

  it('resolves and logs when goal_history.put rejects', async () => {
    const db = createDb();
    const handler = getV2Handler(db);
    const error = new Error('history write failed');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tx = {
      table: (name) => name === 'settings'
        ? { get: vi.fn().mockResolvedValue({ effective_from: '2024-01-01', target_distance_km: 5, target_steps: 6500 }) }
        : { put: vi.fn().mockRejectedValue(error) },
    };
    await expect(handler(tx)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith('[db]', error);
  });

  it('resolves without throwing when settings.get() rejects (fail-open)', async () => {
    const db = createDb();
    const handler = getV2Handler(db);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const tx = { table: () => ({ get: vi.fn().mockRejectedValue(new Error('read failed')) }) };
    await expect(handler(tx)).resolves.toBeUndefined();
  });

  it('logs [db] to console.error when the upgrade throws', async () => {
    const db = createDb();
    const handler = getV2Handler(db);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tx = { table: () => ({ get: vi.fn().mockRejectedValue(new Error('read failed')) }) };
    await handler(tx);
    expect(spy.mock.calls[0][0]).toBe('[db]');
  });
});

// ─── v3 additive migration ────────────────────────────────────────────────────

describe('createDb() — v3 version chain', () => {
  it('calls version(3) in addition to version(2)', async () => {
    const db = createDb();
    const calls = db.version.mock.calls.map(([v]) => v);
    expect(calls).toContain(3);
  });

  it('v3 .stores() string for daily_records equals v2 string (no new index)', async () => {
    const db = createDb();
    const v2Arg = db.version.mock.results[0].value.stores.mock.calls[0][0].daily_records;
    const v3Arg = db.version.mock.results[1].value.stores.mock.calls[0][0].daily_records;
    expect(v3Arg).toBe(v2Arg);
  });

  it('v3 registers an upgrade function', async () => {
    const db = createDb();
    const v3Upgrade = db.version.mock.results[1].value.upgrade;
    expect(v3Upgrade).toHaveBeenCalled();
    expect(typeof v3Upgrade.mock.calls[0][0]).toBe('function');
  });
});

describe('createDb() — v3 upgrade handler', () => {
  function getV3Handler(db) {
    return db.version.mock.results[1].value.upgrade.mock.calls[0][0];
  }

  it('backfills effective_steps = original_steps for legacy row missing fields', async () => {
    const db = createDb();
    const handler = getV3Handler(db);
    const legacyRow = { date: '2024-01-01', original_steps: 8000, original_distance_km: 6.1, synced_at: '2024-01-01T00:00:00Z' };
    const modifyFn = vi.fn().mockResolvedValue(undefined);
    const eachFn = vi.fn().mockImplementation(async (cb) => cb(legacyRow, { modify: modifyFn }));
    const tx = { table: () => ({ toCollection: () => ({ each: eachFn }) }) };
    await handler(tx);
    expect(modifyFn).toHaveBeenCalledWith(
      expect.objectContaining({ effective_steps: 8000, effective_distance_km: 6.1 })
    );
  });

  it('backfills is_overridden = false and override = null for legacy row', async () => {
    const db = createDb();
    const handler = getV3Handler(db);
    const legacyRow = { date: '2024-01-01', original_steps: 5000, original_distance_km: 3.8 };
    const modifyFn = vi.fn().mockResolvedValue(undefined);
    const eachFn = vi.fn().mockImplementation(async (cb) => cb(legacyRow, { modify: modifyFn }));
    const tx = { table: () => ({ toCollection: () => ({ each: eachFn }) }) };
    await handler(tx);
    expect(modifyFn).toHaveBeenCalledWith(
      expect.objectContaining({ is_overridden: false, override: null })
    );
  });

  it('leaves row already carrying all fields untouched (idempotency)', async () => {
    const db = createDb();
    const handler = getV3Handler(db);
    const existingRow = {
      date: '2024-01-01',
      original_steps: 8000,
      original_distance_km: 6.1,
      effective_steps: 9000,
      effective_distance_km: 6.5,
      is_overridden: true,
      override: { note: 'manual' },
    };
    const modifyFn = vi.fn().mockResolvedValue(undefined);
    const eachFn = vi.fn().mockImplementation(async (cb) => cb(existingRow, { modify: modifyFn }));
    const tx = { table: () => ({ toCollection: () => ({ each: eachFn }) }) };
    await handler(tx);
    expect(modifyFn).not.toHaveBeenCalled();
  });

  it('catches errors and logs [db] without rethrowing', async () => {
    const db = createDb();
    const handler = getV3Handler(db);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('table error');
    const tx = { table: () => { throw error; } };
    await expect(handler(tx)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith('[db]', error);
  });
});

// ─── initDB() ─────────────────────────────────────────────────────────────────

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
