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

function makeBetweenChain(records) {
  const betweenFn = vi.fn().mockResolvedValue(records);
  const whereFn = vi.fn().mockReturnValue({ between: betweenFn });
  return { whereFn, betweenFn };
}

function makeDb({ records = [], goalHistory = [] } = {}) {
  const { whereFn, betweenFn } = makeBetweenChain(records);
  return {
    daily_records: {
      where: whereFn,
      toArray: vi.fn().mockResolvedValue(records),
    },
    goal_history: {
      toArray: vi.fn().mockResolvedValue(goalHistory),
    },
    _whereFn: whereFn,
    _betweenFn: betweenFn,
  };
}

function makeGoal(activeGoal = null) {
  return { getActiveGoal: vi.fn().mockResolvedValue(activeGoal) };
}

afterEach(() => vi.restoreAllMocks());

describe('createSearch — executeQuery', () => {
  it('date-range path invokes where("date").between(start, end, true, true)', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb({ records: [] });
    const goal = makeGoal();
    const { executeQuery } = createSearch(db, goal);
    await executeQuery({ startDate: '2026-01-01', endDate: '2026-01-31' });
    expect(db._whereFn).toHaveBeenCalledWith('date');
    expect(db._betweenFn).toHaveBeenCalledWith('2026-01-01', '2026-01-31', true, true);
  });

  it('all-time path (no date range) invokes db.daily_records.toArray() directly', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb({ records: [] });
    const goal = makeGoal();
    const { executeQuery } = createSearch(db, goal);
    await executeQuery({});
    expect(db.daily_records.toArray).toHaveBeenCalled();
    expect(db._whereFn).not.toHaveBeenCalled();
  });

  it('goal.getActiveGoal called exactly once per query regardless of result-set size', async () => {
    const { createSearch } = await import('./search.js');
    const records = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      effective_steps: 8000,
      effective_distance_km: 7.0,
      is_overridden: false,
    }));
    const db = makeDb({ records });
    const goal = makeGoal({ effective_from: '2025-01-01', target_distance_km: 6.0 });
    const { executeQuery } = createSearch(db, goal);
    await executeQuery({});
    expect(goal.getActiveGoal).toHaveBeenCalledTimes(1);
  });

  it('Scenario 1: minDistance=7.5 + targetOutcome=met → only rows meeting both, sorted newest→oldest', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-05', effective_steps: 9000, effective_distance_km: 9.0, is_overridden: false },
      { date: '2026-01-04', effective_steps: 8000, effective_distance_km: 8.5, is_overridden: false },
      { date: '2026-01-03', effective_steps: 6000, effective_distance_km: 7.0, is_overridden: false },
      { date: '2026-01-02', effective_steps: 5000, effective_distance_km: 6.0, is_overridden: false },
      { date: '2026-01-01', effective_steps: 10000, effective_distance_km: 7.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const goal = makeGoal({ effective_from: '2025-01-01', target_distance_km: 8.0 });
    const { executeQuery } = createSearch(db, goal);
    const { records: result } = await executeQuery({ minDistance: 7.5, targetOutcome: 'met' });
    expect(result.length).toBe(2);
    result.forEach((r) => {
      expect(r.effective_distance_km).toBeGreaterThanOrEqual(7.5);
      expect(r.effective_distance_km).toBeGreaterThanOrEqual(8.0);
    });
    expect(result[0].date).toBe('2026-01-05');
    expect(result[1].date).toBe('2026-01-04');
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
    const goal = makeGoal();
    const { executeQuery } = createSearch(db, goal);
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
    const goal = makeGoal();
    const { executeQuery } = createSearch(db, goal);
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
    const goal = makeGoal();
    const { executeQuery } = createSearch(db, goal);
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
    const goal = makeGoal();
    const { executeQuery } = createSearch(db, goal);
    const { records: result } = await executeQuery({ minSteps: 6000, maxSteps: 10000 });
    expect(result.length).toBe(3);
    result.forEach((r) => {
      expect(r.effective_steps).toBeGreaterThanOrEqual(6000);
      expect(r.effective_steps).toBeLessThanOrEqual(10000);
    });
  });

  it('targetOutcome=missed → rows with finite effective_distance_km < target; non-finite excluded', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-04', effective_steps: 8000, effective_distance_km: 5.0, is_overridden: false },
      { date: '2026-01-03', effective_steps: 7000, effective_distance_km: Infinity, is_overridden: false },
      { date: '2026-01-02', effective_steps: 9000, effective_distance_km: NaN, is_overridden: false },
      { date: '2026-01-01', effective_steps: 6000, effective_distance_km: 4.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const goal = makeGoal({ effective_from: '2025-01-01', target_distance_km: 8.0 });
    const { executeQuery } = createSearch(db, goal);
    const { records: result } = await executeQuery({ targetOutcome: 'missed' });
    expect(result.length).toBe(2);
    result.forEach((r) => expect(Number.isFinite(r.effective_distance_km)).toBe(true));
  });

  it('targetOutcome=all (or absent) → no target filter applied', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-03', effective_steps: 8000, effective_distance_km: 5.0, is_overridden: false },
      { date: '2026-01-02', effective_steps: 7000, effective_distance_km: Infinity, is_overridden: false },
      { date: '2026-01-01', effective_steps: 9000, effective_distance_km: 10.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const goal = makeGoal({ effective_from: '2025-01-01', target_distance_km: 8.0 });
    const { executeQuery } = createSearch(db, goal);
    const { records: result } = await executeQuery({ targetOutcome: 'all' });
    expect(result.length).toBe(3);
  });

  it('no records match all AND-combined filters → returns []', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-01', effective_steps: 5000, effective_distance_km: 4.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const goal = makeGoal();
    const { executeQuery } = createSearch(db, goal);
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
    const goal = makeGoal();
    const { executeQuery } = createSearch(db, goal);
    const { records: result } = await executeQuery({});
    expect(result.length).toBe(2);
  });

  it('filters=null → all records returned; no crash', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-01', effective_steps: 8000, effective_distance_km: 6.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const goal = makeGoal();
    const { executeQuery } = createSearch(db, goal);
    await expect(executeQuery(null).then(r => r.records)).resolves.toHaveLength(1);
  });

  it('filters=undefined → all records returned; no crash', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-01', effective_steps: 8000, effective_distance_km: 6.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const goal = makeGoal();
    const { executeQuery } = createSearch(db, goal);
    await expect(executeQuery(undefined).then(r => r.records)).resolves.toHaveLength(1);
  });

  it('non-finite minSteps (NaN) treated as not set; no step filter applied', async () => {
    const { createSearch } = await import('./search.js');
    const records = [
      { date: '2026-01-02', effective_steps: 8000, effective_distance_km: 6.0, is_overridden: false },
      { date: '2026-01-01', effective_steps: 3000, effective_distance_km: 2.0, is_overridden: false },
    ];
    const db = makeDb({ records });
    const goal = makeGoal();
    const { executeQuery } = createSearch(db, goal);
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
    const goal = makeGoal();
    const { executeQuery } = createSearch(db, goal);
    const { records: result } = await executeQuery({});
    expect(result[0].date).toBe('2026-01-03');
    expect(result[1].date).toBe('2026-01-02');
    expect(result[2].date).toBe('2026-01-01');
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
    const goal = makeGoal();
    const { computeResultSummary } = createSearch(db, goal);
    const records = [
      { effective_distance_km: 6.0, effective_steps: 8000 },
      { effective_distance_km: 7.5, effective_steps: 9000 },
      { effective_distance_km: Infinity, effective_steps: 7000 },
    ];
    const result = computeResultSummary(records, 5);
    expect(result.count).toBe(3);
    expect(result.matchPct).toBe(60);
    expect(result.cumulativeDistanceKm).toBe(13.5);
    expect(result.avgSteps).toBe(8000);
    expect(result.totalDays).toBe(5);
  });

  it('matchPct rounds correctly: count=1, totalDays=3 → matchPct=33', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb();
    const goal = makeGoal();
    const { computeResultSummary } = createSearch(db, goal);
    const records = [{ effective_distance_km: 5.0, effective_steps: 7000 }];
    const result = computeResultSummary(records, 3);
    expect(result.matchPct).toBe(33);
  });

  it('empty result → count:0, matchPct:null, cumulativeDistanceKm:0, avgSteps:null', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb();
    const goal = makeGoal();
    const { computeResultSummary } = createSearch(db, goal);
    const result = computeResultSummary([], 5);
    expect(result.count).toBe(0);
    expect(result.matchPct).toBeNull();
    expect(result.cumulativeDistanceKm).toBe(0);
    expect(result.avgSteps).toBeNull();
  });

  it('totalDays=0 → matchPct:null (no divide-by-zero)', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb();
    const goal = makeGoal();
    const { computeResultSummary } = createSearch(db, goal);
    const result = computeResultSummary([], 0);
    expect(result.matchPct).toBeNull();
  });

  it('non-finite effective_distance_km rows contribute 0 to cumulativeDistanceKm', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb();
    const goal = makeGoal();
    const { computeResultSummary } = createSearch(db, goal);
    const records = [
      { effective_distance_km: Infinity, effective_steps: 8000 },
      { effective_distance_km: NaN, effective_steps: 8000 },
      { effective_distance_km: 5.0, effective_steps: 8000 },
    ];
    const result = computeResultSummary(records, 3);
    expect(result.cumulativeDistanceKm).toBe(5.0);
  });

  it('all-time denominator is total row count (not calendar-day span): sparse history fixture', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb();
    const goal = makeGoal();
    const { computeResultSummary } = createSearch(db, goal);
    const records = Array.from({ length: 4 }, (_, i) => ({
      effective_distance_km: 6.0,
      effective_steps: 8000,
    }));
    const result = computeResultSummary(records, 10);
    expect(result.matchPct).toBe(40);
    expect(result.totalDays).toBe(10);
  });

  it('avgSteps uses effective_steps not original_steps', async () => {
    const { createSearch } = await import('./search.js');
    const db = makeDb();
    const goal = makeGoal();
    const { computeResultSummary } = createSearch(db, goal);
    const records = [
      { effective_distance_km: 5.0, effective_steps: 9000, original_steps: 5000 },
      { effective_distance_km: 6.0, effective_steps: 7000, original_steps: 3000 },
    ];
    const result = computeResultSummary(records, 2);
    expect(result.avgSteps).toBe(8000);
  });
});
