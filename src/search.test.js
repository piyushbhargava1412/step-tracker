import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('dexie', async () => {
  class MockDexie {
    constructor(name) {
      this._name = name;
    }
  }
  return { default: MockDexie };
});

function makeCollection(records) {
  return { toArray: vi.fn().mockResolvedValue(records) };
}

function makeBetweenChain(records) {
  const collection = makeCollection(records);
  const betweenFn = vi.fn().mockReturnValue(collection);
  const whereFn = vi.fn().mockReturnValue({ between: betweenFn });
  return { whereFn, betweenFn, collection };
}

function makeDb({ records = [] } = {}) {
  const { whereFn, betweenFn, collection } = makeBetweenChain(records);
  return {
    daily_records: {
      where: whereFn,
      toArray: vi.fn().mockResolvedValue(records),
    },
    _whereFn: whereFn,
    _betweenFn: betweenFn,
    _collection: collection,
  };
}

afterEach(() => vi.restoreAllMocks());

// ── Task 12: Structural proof ─────────────────────────────────────────────────

describe('createSearch — Task 12 structural proof', () => {
  it('search.js has NO import from goal.js or goal-history.js (AC Scenario 3)', () => {
    const source = fs.readFileSync(path.resolve('src/search.js'), 'utf8');
    expect(source).not.toMatch(/from ['"]\.\/goal\.js['"]/);
    expect(source).not.toMatch(/from ['"]\.\/goal-history\.js['"]/);
  });

  it('createSearch accepts only (db) — no goal parameter (source-level check)', () => {
    const source = fs.readFileSync(path.resolve('src/search.js'), 'utf8');
    // The factory signature should be createSearch(db) not createSearch(db, goal)
    expect(source).toMatch(/export function createSearch\s*\(\s*db\s*\)/);
  });

  it('executeQuery never calls db.goal_history.toArray()', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb({ records: [] });
    // Attach a spy for goal_history – should NOT exist or NOT be called
    const goalHistorySpy = vi.fn().mockResolvedValue([]);
    db.goal_history = { toArray: goalHistorySpy };
    const { executeQuery } = createSearch(db);
    await executeQuery({});
    expect(goalHistorySpy).not.toHaveBeenCalled();
  });
});

// ── executeQuery — decoupled signature ───────────────────────────────────────

describe('createSearch — executeQuery', () => {
  it('date-range path invokes where("date").between(start, end, true, true)', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb({ records: [] });
    const { executeQuery } = createSearch(db);
    await executeQuery({ startDate: '2026-01-01', endDate: '2026-01-31' });
    expect(db._whereFn).toHaveBeenCalledWith('date');
    expect(db._betweenFn).toHaveBeenCalledWith('2026-01-01', '2026-01-31', true, true);
  });

  it('date-range path calls .toArray() on the Collection returned by between()', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-02-01', effective_steps: 8000, effective_distance_km: 6.0, is_overridden: false },
      { date: '2026-02-02', effective_steps: 9000, effective_distance_km: 7.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({ startDate: '2026-02-01', endDate: '2026-02-28' });
    expect(db._collection.toArray).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe('2026-02-02');
  });

  it('all-time path (no date range) invokes db.daily_records.toArray() directly', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb({ records: [] });
    const { executeQuery } = createSearch(db);
    await executeQuery({});
    expect(db.daily_records.toArray).toHaveBeenCalled();
    expect(db._whereFn).not.toHaveBeenCalled();
  });

  // Task 12: Scenario 1 rewritten — outcome half re-expressed on stepTarget (SF-11)
  it('Scenario 1 (rewritten): minSteps=8000 + targetOutcome=met + stepTarget=5000 → only rows >= 5000 effective_steps AND >= minSteps', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-05', effective_steps: 9000, effective_distance_km: 9.0, is_overridden: false },
      { date: '2026-01-04', effective_steps: 8000, effective_distance_km: 8.5, is_overridden: false },
      { date: '2026-01-03', effective_steps: 6000, effective_distance_km: 7.0, is_overridden: false },
      { date: '2026-01-02', effective_steps: 5000, effective_distance_km: 6.0, is_overridden: false },
      { date: '2026-01-01', effective_steps: 3000, effective_distance_km: 2.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({ minSteps: 8000, targetOutcome: 'met', stepTarget: 5000 });
    expect(result.length).toBe(2);
    result.forEach((r) => {
      expect(r.effective_steps).toBeGreaterThanOrEqual(8000);
      expect(r.effective_steps).toBeGreaterThanOrEqual(5000);
    });
    expect(result[0].date).toBe('2026-01-05');
    expect(result[1].date).toBe('2026-01-04');
  });

  // Task 12: targetOutcome='met' keeps only >= stepTarget
  it('targetOutcome=met with stepTarget=5000 keeps only effective_steps >= 5000', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-03', effective_steps: 5000, effective_distance_km: 4.0, is_overridden: false },
      { date: '2026-01-02', effective_steps: 4999, effective_distance_km: 3.5, is_overridden: false },
      { date: '2026-01-01', effective_steps: 8000, effective_distance_km: 6.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({ targetOutcome: 'met', stepTarget: 5000 });
    expect(result.length).toBe(2);
    result.forEach((r) => expect(r.effective_steps).toBeGreaterThanOrEqual(5000));
  });

  // Task 12: targetOutcome='missed' keeps only < stepTarget
  it('targetOutcome=missed with stepTarget=5000 keeps only effective_steps < 5000', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-03', effective_steps: 5000, effective_distance_km: 4.0, is_overridden: false },
      { date: '2026-01-02', effective_steps: 4999, effective_distance_km: 3.5, is_overridden: false },
      { date: '2026-01-01', effective_steps: 3000, effective_distance_km: 2.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({ targetOutcome: 'missed', stepTarget: 5000 });
    expect(result.length).toBe(2);
    result.forEach((r) => expect(r.effective_steps).toBeLessThan(5000));
  });

  // Task 12: non-finite effective_steps excluded from both met and missed
  it('targetOutcome=met: record with non-finite effective_steps is excluded', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-02', effective_steps: NaN, effective_distance_km: 6.0, is_overridden: false },
      { date: '2026-01-01', effective_steps: 6000, effective_distance_km: 5.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({ targetOutcome: 'met', stepTarget: 5000 });
    expect(result.length).toBe(1);
    expect(result[0].date).toBe('2026-01-01');
  });

  it('targetOutcome=missed: record with non-finite effective_steps is excluded', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-02', effective_steps: NaN, effective_distance_km: 6.0, is_overridden: false },
      { date: '2026-01-01', effective_steps: 3000, effective_distance_km: 2.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({ targetOutcome: 'missed', stepTarget: 5000 });
    expect(result.length).toBe(1);
    expect(result[0].date).toBe('2026-01-01');
  });

  // Task 12: fail-open — targetOutcome='met' with no stepTarget is a no-op
  it('targetOutcome=met with no stepTarget returns unfiltered set and does not throw', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-02', effective_steps: 1000, effective_distance_km: 1.0, is_overridden: false },
      { date: '2026-01-01', effective_steps: 9000, effective_distance_km: 7.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({ targetOutcome: 'met' });
    expect(result.length).toBe(2);
  });

  it('targetOutcome=met with stepTarget=NaN is a no-op (fail-open)', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-01', effective_steps: 9000, effective_distance_km: 7.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({ targetOutcome: 'met', stepTarget: NaN });
    expect(result.length).toBe(1);
  });

  // Task 12: minDistance has NO effect on result set
  it('passing filters.minDistance has no effect on result set', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-02', effective_steps: 8000, effective_distance_km: 3.0, is_overridden: false },
      { date: '2026-01-01', effective_steps: 7000, effective_distance_km: 2.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    // With minDistance=10 (very high), both records should still be returned
    const { records: result } = await executeQuery({ minDistance: 10 });
    expect(result.length).toBe(2);
  });

  it('Scenario 2: overrideStatus=overridden → only rows with is_overridden === true', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-04', effective_steps: 8000, effective_distance_km: 6.0, is_overridden: true },
      { date: '2026-01-03', effective_steps: 7000, effective_distance_km: 5.5, is_overridden: false },
      { date: '2026-01-02', effective_steps: 9000, effective_distance_km: 7.0, is_overridden: true },
      { date: '2026-01-01', effective_steps: 6000, effective_distance_km: 4.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({ overrideStatus: 'overridden' });
    expect(result.length).toBe(2);
    result.forEach((r) => expect(r.is_overridden).toBe(true));
  });

  it('overrideStatus=not-overridden → only rows with is_overridden === false', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-04', effective_steps: 8000, effective_distance_km: 6.0, is_overridden: true },
      { date: '2026-01-03', effective_steps: 7000, effective_distance_km: 5.5, is_overridden: false },
      { date: '2026-01-02', effective_steps: 9000, effective_distance_km: 7.0, is_overridden: true },
      { date: '2026-01-01', effective_steps: 6000, effective_distance_km: 4.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({ overrideStatus: 'not-overridden' });
    expect(result.length).toBe(2);
    result.forEach((r) => expect(r.is_overridden).toBe(false));
  });

  it('overrideStatus=all → no override filter', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-04', effective_steps: 8000, effective_distance_km: 6.0, is_overridden: true },
      { date: '2026-01-03', effective_steps: 7000, effective_distance_km: 5.5, is_overridden: false },
      { date: '2026-01-02', effective_steps: 9000, effective_distance_km: 7.0, is_overridden: true },
      { date: '2026-01-01', effective_steps: 6000, effective_distance_km: 4.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({ overrideStatus: 'all' });
    expect(result.length).toBe(4);
  });

  it('minSteps + maxSteps AND-combined: rows outside inclusive band excluded', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-05', effective_steps: 12000, effective_distance_km: 9.0, is_overridden: false },
      { date: '2026-01-04', effective_steps: 9000, effective_distance_km: 7.5, is_overridden: false },
      { date: '2026-01-03', effective_steps: 8000, effective_distance_km: 6.5, is_overridden: false },
      { date: '2026-01-02', effective_steps: 7000, effective_distance_km: 5.5, is_overridden: false },
      { date: '2026-01-01', effective_steps: 5000, effective_distance_km: 4.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({ minSteps: 6000, maxSteps: 10000 });
    expect(result.length).toBe(3);
    result.forEach((r) => {
      expect(r.effective_steps).toBeGreaterThanOrEqual(6000);
      expect(r.effective_steps).toBeLessThanOrEqual(10000);
    });
  });

  it('targetOutcome=missed with stepTarget → keeps only < stepTarget; non-finite excluded', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-04', effective_steps: 8000, effective_distance_km: 5.0, is_overridden: false },
      { date: '2026-01-03', effective_steps: NaN, effective_distance_km: Infinity, is_overridden: false },
      { date: '2026-01-02', effective_steps: Infinity, effective_distance_km: NaN, is_overridden: false },
      { date: '2026-01-01', effective_steps: 6000, effective_distance_km: 4.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({ targetOutcome: 'missed', stepTarget: 9000 });
    expect(result.length).toBe(2);
    result.forEach((r) => expect(Number.isFinite(r.effective_steps)).toBe(true));
  });

  it('targetOutcome=all (or absent) → no target filter applied', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-03', effective_steps: 8000, effective_distance_km: 5.0, is_overridden: false },
      { date: '2026-01-02', effective_steps: 7000, effective_distance_km: Infinity, is_overridden: false },
      { date: '2026-01-01', effective_steps: 9000, effective_distance_km: 10.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({ targetOutcome: 'all' });
    expect(result.length).toBe(3);
  });

  it('no records match all AND-combined filters → returns []', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-01', effective_steps: 5000, effective_distance_km: 4.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({ minSteps: 100000 });
    expect(result).toEqual([]);
  });

  it('empty filters object → all records returned', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-02', effective_steps: 8000, effective_distance_km: 6.0, is_overridden: false },
      { date: '2026-01-01', effective_steps: 7000, effective_distance_km: 5.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({});
    expect(result.length).toBe(2);
  });

  it('filters=null → all records returned; no crash', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-01', effective_steps: 8000, effective_distance_km: 6.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    await expect(executeQuery(null).then(r => r.records)).resolves.toHaveLength(1);
  });

  it('filters=undefined → all records returned; no crash', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-01', effective_steps: 8000, effective_distance_km: 6.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    await expect(executeQuery(undefined).then(r => r.records)).resolves.toHaveLength(1);
  });

  it('non-finite minSteps (NaN) treated as not set; no step filter applied', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-02', effective_steps: 8000, effective_distance_km: 6.0, is_overridden: false },
      { date: '2026-01-01', effective_steps: 3000, effective_distance_km: 2.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({ minSteps: NaN });
    expect(result.length).toBe(2);
  });

  it('result is sorted descending by date (newest first)', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-01', effective_steps: 7000, effective_distance_km: 5.0, is_overridden: false },
      { date: '2026-01-03', effective_steps: 9000, effective_distance_km: 7.0, is_overridden: false },
      { date: '2026-01-02', effective_steps: 8000, effective_distance_km: 6.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const { executeQuery } = createSearch(db);
    const { records: result } = await executeQuery({});
    expect(result[0].date).toBe('2026-01-03');
    expect(result[1].date).toBe('2026-01-02');
    expect(result[2].date).toBe('2026-01-01');
  });

  it('executeQuery rejects when db.daily_records.toArray() throws (all-time path)', async () => {
    const { createSearch } = await import('./search.js');
    const dbErr = new Error('IndexedDB read failure');
    const db = {
      daily_records: { where: vi.fn(), toArray: vi.fn().mockRejectedValue(dbErr) },
    };
    const { executeQuery } = createSearch(db);
    await expect(executeQuery({})).rejects.toThrow('IndexedDB read failure');
  });

  it('executeQuery rejects when db.daily_records.where().between().toArray() throws (date-range path)', async () => {
    const { createSearch } = await import('./search.js');
    const dbErr = new Error('IndexedDB range failure');
    const collection = { toArray: vi.fn().mockRejectedValue(dbErr) };
    const db = {
      daily_records: { where: vi.fn().mockReturnValue({ between: vi.fn().mockReturnValue(collection) }), toArray: vi.fn() },
    };
    const { executeQuery } = createSearch(db);
    await expect(executeQuery({ startDate: '2026-01-01', endDate: '2026-01-31' })).rejects.toThrow('IndexedDB range failure');
  });

  it('no DOM API used and no toISOString() call in search.js', () => {
    const source = fs.readFileSync(path.resolve('src/search.js'), 'utf8');
    expect(source).not.toMatch(/toISOString\(\)/);
    expect(source).not.toMatch(/\bdocument\b/);
    expect(source).not.toMatch(/\bwindow\b/);
  });
});

describe('createSearch — computeResultSummary', () => {
  it('Scenario 1 tail: count, matchPct, cumulativeDistanceKm, avgSteps correct for mixed 3-record result out of 5 pre-filter records', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb();
    const { computeResultSummary } = createSearch(db);
    const records = [
      { effective_distance_km: 6.0, effective_steps: 8000 },
      { effective_distance_km: 7.5, effective_steps: 9000 },
      { effective_distance_km: Infinity, effective_steps: 7000 },
    ];
    const preFilterSet = Array.from({ length: 5 }, () => ({}));
    const result = computeResultSummary(records, preFilterSet);
    expect(result.count).toBe(3);
    expect(result.matchPct).toBe(60);
    expect(result.cumulativeDistanceKm).toBe(13.5);
    expect(result.avgSteps).toBe(8000);
    expect(result.totalDays).toBe(5);
  });

  it('matchPct rounds correctly: count=1, totalDays=3 → matchPct=33', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb();
    const { computeResultSummary } = createSearch(db);
    const records = [{ effective_distance_km: 5.0, effective_steps: 7000 }];
    const preFilterSet = Array.from({ length: 3 }, () => ({}));
    const result = computeResultSummary(records, preFilterSet);
    expect(result.matchPct).toBe(33);
  });

  it('empty result → count:0, matchPct:null, cumulativeDistanceKm:0, avgSteps:null', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb();
    const { computeResultSummary } = createSearch(db);
    const preFilterSet = Array.from({ length: 5 }, () => ({}));
    const result = computeResultSummary([], preFilterSet);
    expect(result.count).toBe(0);
    expect(result.matchPct).toBeNull();
    expect(result.cumulativeDistanceKm).toBe(0);
    expect(result.avgSteps).toBeNull();
  });

  it('totalDays=0 → matchPct:null (no divide-by-zero)', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb();
    const { computeResultSummary } = createSearch(db);
    const result = computeResultSummary([], []);
    expect(result.matchPct).toBeNull();
  });

  it('non-finite effective_distance_km rows contribute 0 to cumulativeDistanceKm', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb();
    const { computeResultSummary } = createSearch(db);
    const records = [
      { effective_distance_km: Infinity, effective_steps: 8000 },
      { effective_distance_km: NaN, effective_steps: 8000 },
      { effective_distance_km: 5.0, effective_steps: 8000 },
    ];
    const preFilterSet = Array.from({ length: 3 }, () => ({}));
    const result = computeResultSummary(records, preFilterSet);
    expect(result.cumulativeDistanceKm).toBe(5.0);
  });

  it('all-time denominator is total row count (not calendar-day span): sparse history fixture', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb();
    const { computeResultSummary } = createSearch(db);
    const records = Array.from({ length: 4 }, () => ({
      effective_distance_km: 6.0,
      effective_steps: 8000,
    }));
    const preFilterSet = Array.from({ length: 10 }, () => ({}));
    const result = computeResultSummary(records, preFilterSet);
    expect(result.matchPct).toBe(40);
    expect(result.totalDays).toBe(10);
  });

  it('avgSteps uses effective_steps not original_steps', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb();
    const { computeResultSummary } = createSearch(db);
    const records = [
      { effective_distance_km: 5.0, effective_steps: 9000, original_steps: 5000 },
      { effective_distance_km: 6.0, effective_steps: 7000, original_steps: 3000 },
    ];
    const preFilterSet = Array.from({ length: 2 }, () => ({}));
    const result = computeResultSummary(records, preFilterSet);
    expect(result.avgSteps).toBe(8000);
  });
});
