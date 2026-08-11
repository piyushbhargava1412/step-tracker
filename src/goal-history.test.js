/**
 * Tests for src/goal-history.js — pure goal-history computation.
 * Inline fixture builders only (no factory library), mirroring streak.test.js.
 */

import {
  resolveGoalForDate,
  buildEffectiveGoalHistory,
  _prepareGoalHistory,
  _resolvePreparedGoalForDate,
  _sortByEffectiveFrom,
  _isValidGoalRow,
  _isValidActiveGoalForHistory,
  _isValidRecord,
  _sortByDate,
  _ascBy,
} from './goal-history.js';
import { DEFAULT_GOAL_KM } from './goal.js';

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// Fixture builders (test-local, independent of the implementation under test)
// ---------------------------------------------------------------------------

/** Builds a goal_history row. */
function goalRow(effective_from, km, steps) {
  return {
    effective_from,
    target_distance_km: km,
    target_steps: steps || Math.round(km * 1312.33),
  };
}

// ---------------------------------------------------------------------------
// _isValidGoalRow
// ---------------------------------------------------------------------------

describe('_isValidGoalRow', () => {
  it('returns true for a well-formed row', () => {
    expect(_isValidGoalRow(goalRow('2026-01-01', 3.0))).toBe(true);
  });

  it('returns false for null/undefined', () => {
    expect(_isValidGoalRow(null)).toBe(false);
    expect(_isValidGoalRow(undefined)).toBe(false);
    expect(_isValidGoalRow(42)).toBe(false);
  });

  it('returns false for non-object types', () => {
    expect(_isValidGoalRow('string')).toBe(false);
    expect(_isValidGoalRow([])).toBe(false);
  });

  it('returns false when effective_from is missing', () => {
    expect(_isValidGoalRow({ target_distance_km: 3.0 })).toBe(false);
  });

  it('returns false when effective_from is empty', () => {
    expect(_isValidGoalRow({ effective_from: '' })).toBe(false);
  });

  it('returns false for non-finite target_distance_km', () => {
    expect(_isValidGoalRow(goalRow('2026-01-01', NaN))).toBe(false);
    expect(_isValidGoalRow(goalRow('2026-01-01', Infinity))).toBe(false);
    expect(_isValidGoalRow(goalRow('2026-01-01', -Infinity))).toBe(false);
  });

  it('returns false for zero or negative target_distance_km', () => {
    expect(_isValidGoalRow(goalRow('2026-01-01', 0))).toBe(false);
    expect(_isValidGoalRow(goalRow('2026-01-01', -1))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// _isValidActiveGoalForHistory
// ---------------------------------------------------------------------------

describe('_isValidActiveGoalForHistory', () => {
  it('returns true for a well-formed active_goal', () => {
    expect(_isValidActiveGoalForHistory(goalRow('2026-01-01', 3.0))).toBe(true);
  });

  it('returns false for null/undefined', () => {
    expect(_isValidActiveGoalForHistory(null)).toBe(false);
    expect(_isValidActiveGoalForHistory(undefined)).toBe(false);
  });

  it('returns false when target_distance_km is non-finite or zero', () => {
    expect(_isValidActiveGoalForHistory(goalRow('2026-01-01', NaN))).toBe(false);
    expect(_isValidActiveGoalForHistory(goalRow('2026-01-01', 0))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// _isValidRecord
// ---------------------------------------------------------------------------

describe('_isValidRecord', () => {
  it('returns true for a well-formed record', () => {
    expect(_isValidRecord({ date: '2026-01-01', effective_steps: 5000 })).toBe(true);
  });

  it('returns false for null/undefined', () => {
    expect(_isValidRecord(null)).toBe(false);
    expect(_isValidRecord(undefined)).toBe(false);
  });

  it('returns false when date is missing or empty', () => {
    expect(_isValidRecord({ effective_steps: 5000 })).toBe(false);
    expect(_isValidRecord({ date: '' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// _sortByDate / _sortByEffectiveFrom / _ascBy
// ---------------------------------------------------------------------------

describe('_sortByDate', () => {
  it('returns records ascending by date', () => {
    const input = [{ date: '2026-01-03' }, { date: '2026-01-01' }, { date: '2026-01-02' }];
    expect(_sortByDate(input).map((r) => r.date)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);
  });

  it('is stable for equal dates', () => {
    const input = [
      { date: '2026-01-02', effective_distance_km: 1 },
      { date: '2026-01-01' },
      { date: '2026-01-02', effective_distance_km: 2 },
    ];
    const sorted = _sortByDate(input);
    expect(sorted.map((r) => r.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-02']);
    expect(sorted[1].effective_distance_km).toBe(1);
  });
});

describe('_sortByEffectiveFrom', () => {
  it('returns rows sorted by effective_from', () => {
    const input = [goalRow('2026-03-01', 10.0), goalRow('2026-01-01', 3.0)];
    expect(_sortByEffectiveFrom(input).map((r) => r.effective_from)).toEqual([
      '2026-01-01',
      '2026-03-01',
    ]);
  });

  it('is stable for same-day entries', () => {
    const input = [goalRow('2026-01-01', 3.0), goalRow('2026-01-01', 7.0)];
    const sorted = _sortByEffectiveFrom(input);
    expect(sorted.map((r) => r.target_distance_km)).toEqual([3.0, 7.0]);
  });
});

// ---------------------------------------------------------------------------
// _prepareGoalHistory
// ---------------------------------------------------------------------------

describe('_prepareGoalHistory', () => {
  it('filters invalid rows and sorts by effective_from', () => {
    const input = [
      { effective_from: '2026-03-01', target_distance_km: 10.0 },
      null,
      { target_distance_km: 5.0 },
      goalRow('2026-01-01', 3.0),
      { effective_from: '2026-01-01', target_distance_km: NaN },
    ];
    const result = _prepareGoalHistory(input);
    expect(result.map((r) => r.effective_from)).toEqual(['2026-01-01', '2026-03-01']);
  });

  it('returns [] for non-array input', () => {
    expect(_prepareGoalHistory(null)).toEqual([]);
    expect(_prepareGoalHistory(undefined)).toEqual([]);
    expect(_prepareGoalHistory('string')).toEqual([]);
  });

  it('returns [] for empty array', () => {
    expect(_prepareGoalHistory([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// _resolvePreparedGoalForDate
// ---------------------------------------------------------------------------

describe('_resolvePreparedGoalForDate', () => {
  it('returns DEFAULT_GOAL_KM for empty valid array', () => {
    expect(_resolvePreparedGoalForDate([], '2026-01-01')).toBe(DEFAULT_GOAL_KM);
  });

  it('returns earliest entry for dates before all entries', () => {
    const valid = [goalRow('2026-05-01', 5.0), goalRow('2026-06-01', 10.0)];
    expect(_resolvePreparedGoalForDate(valid, '2026-01-01')).toBe(5.0);
  });

  it('returns the latest entry with effective_from <= dateStr', () => {
    const valid = [goalRow('2026-01-01', 3.0), goalRow('2026-02-01', 5.0)];
    expect(_resolvePreparedGoalForDate(valid, '2026-01-15')).toBe(3.0);
    expect(_resolvePreparedGoalForDate(valid, '2026-02-01')).toBe(5.0);
    expect(_resolvePreparedGoalForDate(valid, '2026-03-10')).toBe(5.0);
  });

  it('same-day overwrite: later entry wins', () => {
    const valid = [goalRow('2026-01-01', 3.0), goalRow('2026-01-01', 7.0)];
    expect(_resolvePreparedGoalForDate(valid, '2026-01-01')).toBe(7.0);
  });
});

// ---------------------------------------------------------------------------
// resolveGoalForDate (public API)
// ---------------------------------------------------------------------------

describe('resolveGoalForDate', () => {
  it('returns the latest entry with effective_from <= date', () => {
    const history = [goalRow('2026-01-01', 3.0), goalRow('2026-02-01', 5.0)];
    expect(resolveGoalForDate(history, '2026-01-15')).toBe(3.0);
    expect(resolveGoalForDate(history, '2026-02-01')).toBe(5.0);
    expect(resolveGoalForDate(history, '2026-03-10')).toBe(5.0);
  });

  it('sorts unsorted goalHistory internally', () => {
    const history = [goalRow('2026-03-01', 10.0), goalRow('2026-01-01', 3.0), goalRow('2026-02-01', 5.0)];
    expect(resolveGoalForDate(history, '2026-02-15')).toBe(5.0);
    expect(resolveGoalForDate(history, '2026-12-31')).toBe(10.0);
  });

  it('dates before the earliest entry resolve to the earliest entry (seed baseline, SF-1)', () => {
    const history = [goalRow('2026-05-01', 5.0), goalRow('2026-06-01', 10.0)];
    expect(resolveGoalForDate(history, '2026-01-01')).toBe(5.0);
  });

  it('same-day overwrite: the later entry for an identical effective_from governs', () => {
    const history = [goalRow('2026-01-01', 3.0), goalRow('2026-01-01', 7.0)];
    expect(resolveGoalForDate(history, '2026-01-01')).toBe(7.0);
    expect(resolveGoalForDate(history, '2026-01-05')).toBe(7.0);
  });

  it('empty goalHistory → DEFAULT_GOAL_KM (SF-12 guard)', () => {
    expect(resolveGoalForDate([], '2026-01-01')).toBe(DEFAULT_GOAL_KM);
    expect(DEFAULT_GOAL_KM).toBe(3.0);
  });

  it('non-array goalHistory → DEFAULT_GOAL_KM (guard)', () => {
    expect(resolveGoalForDate(null, '2026-01-01')).toBe(DEFAULT_GOAL_KM);
    expect(resolveGoalForDate(undefined, '2026-01-01')).toBe(DEFAULT_GOAL_KM);
  });

  it('ignores corrupt rows and falls back when none are usable (SF-13 guard)', () => {
    const corrupt = [null, { effective_from: '2026-01-01' }, { target_distance_km: 5 }, { effective_from: '2026-01-01', target_distance_km: NaN }];
    expect(resolveGoalForDate(corrupt, '2026-06-01')).toBe(DEFAULT_GOAL_KM);
  });

  it('ignores corrupt rows but still uses the valid ones', () => {
    const mixed = [{ effective_from: '2026-01-01', target_distance_km: Infinity }, goalRow('2026-01-02', 5.0)];
    expect(resolveGoalForDate(mixed, '2026-06-01')).toBe(5.0);
  });
});

// ---------------------------------------------------------------------------
// buildEffectiveGoalHistory
// ---------------------------------------------------------------------------

describe('buildEffectiveGoalHistory', () => {
  it('returns the history array unchanged when non-empty', () => {
    const history = [goalRow('2026-01-01', 3.0), goalRow('2026-02-01', 5.0)];
    expect(buildEffectiveGoalHistory(history, null)).toEqual(history);
  });

  it('synthesizes from active_goal when history is empty', () => {
    const activeGoal = {
      effective_from: '2026-08-01',
      target_distance_km: 5.0,
      target_steps: 6562,
    };
    const result = buildEffectiveGoalHistory([], activeGoal);
    expect(result).toHaveLength(1);
    expect(result[0].effective_from).toBe('2026-08-01');
    expect(result[0].target_distance_km).toBe(5.0);
    expect(result[0].target_steps).toBe(6562);
  });

  it('returns [] when history is empty and activeGoal is null', () => {
    expect(buildEffectiveGoalHistory([], null)).toEqual([]);
  });

  it('returns [] when history is empty and activeGoal is corrupt', () => {
    expect(buildEffectiveGoalHistory([], { target_distance_km: NaN })).toEqual([]);
    expect(buildEffectiveGoalHistory([], { effective_from: '' })).toEqual([]);
    expect(buildEffectiveGoalHistory([], { target_distance_km: 0 })).toEqual([]);
  });
});
