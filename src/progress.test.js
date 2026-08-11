/**
 * Tests for src/progress.js — pure computation + today's data resolution.
 * No mocking needed for computeProgress — pure function with inline fixtures.
 * getTodayRecord and _formatLocalDate tested with simple stubs.
 */

import { computeProgress, getTodayRecord } from './progress.js';
import { DEFAULT_STEP_GOAL } from './goal.js';
import { _localDate as _formatLocalDate } from './date-utils.js';

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// _formatLocalDate
// ---------------------------------------------------------------------------
describe('_formatLocalDate', () => {
  it('returns YYYY-MM-DD using local getters (timezone-safe)', () => {
    // Use a fixed Date object and spy on its getters to ensure local getters used
    const ts = new Date(2024, 0, 5).getTime(); // Jan 5 2024 local midnight
    const result = _formatLocalDate(ts);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Verify it uses local date, not UTC — construct expected from local getters
    const d = new Date(ts);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(result).toBe(expected);
  });

  it('zero-pads single-digit month and day', () => {
    // March 5, 2023 local
    const ts = new Date(2023, 2, 5).getTime();
    const result = _formatLocalDate(ts);
    expect(result).toMatch(/^\d{4}-03-05$/);
  });

  it('works with no argument — uses Date.now()', () => {
    const result = _formatLocalDate();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// getTodayRecord
// ---------------------------------------------------------------------------
describe('getTodayRecord', () => {
  it('calls db.daily_records.get with a local YYYY-MM-DD key', async () => {
    const mockGet = vi.fn().mockResolvedValue({ effective_steps: 100 });
    const mockDb = { daily_records: { get: mockGet } };

    await getTodayRecord(mockDb);

    expect(mockGet).toHaveBeenCalledTimes(1);
    const arg = mockGet.mock.calls[0][0];
    expect(arg).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses local date key, not UTC-shifted key', async () => {
    const mockGet = vi.fn().mockResolvedValue(undefined);
    const mockDb = { daily_records: { get: mockGet } };

    // Spy on _formatLocalDate indirectly — just verify arg is local date format
    await getTodayRecord(mockDb);

    const arg = mockGet.mock.calls[0][0];
    const d = new Date();
    const localExpected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(arg).toBe(localExpected);
  });

  it('returns whatever db.daily_records.get resolves to', async () => {
    const record = { effective_steps: 3200 };
    const mockDb = { daily_records: { get: vi.fn().mockResolvedValue(record) } };

    const result = await getTodayRecord(mockDb);
    expect(result).toBe(record);
  });

  it('propagates rejection (progress-ui owns the try/catch)', async () => {
    const err = new Error('db fail');
    const mockDb = { daily_records: { get: vi.fn().mockRejectedValue(err) } };

    await expect(getTodayRecord(mockDb)).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// computeProgress — happy path against the step lens
// ---------------------------------------------------------------------------
describe('computeProgress — happy path (step goal)', () => {
  it('3200 / 10000 → pct=32, remaining_steps=6800, goalMet=false', () => {
    const result = computeProgress({ effective_steps: 3200 }, 10000);

    expect(result).toStrictEqual({
      steps: 3200,
      target_steps: 10000,
      pct: 32,
      remaining_steps: 6800,
      goalMet: false,
    });
  });

  it('rounds pct to the nearest integer', () => {
    // 3333 / 10000 = 33.33% → 33
    expect(computeProgress({ effective_steps: 3333 }, 10000).pct).toBe(33);
    // 3335 / 7500 = 44.466…% → 44
    expect(computeProgress({ effective_steps: 3335 }, 7500).pct).toBe(44);
  });

  it('honours every STEP_GOAL_OPTIONS value as the denominator', () => {
    expect(computeProgress({ effective_steps: 2500 }, 5000).pct).toBe(50);
    expect(computeProgress({ effective_steps: 2500 }, 7500).pct).toBe(33);
    expect(computeProgress({ effective_steps: 2500 }, 10000).pct).toBe(25);
    expect(computeProgress({ effective_steps: 2500 }, 15000).pct).toBe(17);
  });
});

// ---------------------------------------------------------------------------
// computeProgress — return-shape contract
// ---------------------------------------------------------------------------
describe('computeProgress — return-shape contract', () => {
  it('returns exactly the 5 step-lens keys — no distance fields', () => {
    const result = computeProgress({ effective_steps: 4000, effective_distance_km: 3.05 }, 10000);

    expect(Object.keys(result).sort()).toStrictEqual(
      ['goalMet', 'pct', 'remaining_steps', 'steps', 'target_steps']
    );
    expect(result).not.toHaveProperty('distance_km');
    expect(result).not.toHaveProperty('target_km');
    expect(result).not.toHaveProperty('remaining_km');
    expect(result).not.toHaveProperty('remaining_m');
  });
});

// ---------------------------------------------------------------------------
// computeProgress — boundary values
// ---------------------------------------------------------------------------
describe('computeProgress — boundary values', () => {
  it('0 steps → pct=0, remaining_steps=10000, goalMet=false, no NaN', () => {
    const result = computeProgress({ effective_steps: 0 }, 10000);
    expect(result.pct).toBe(0);
    expect(result.remaining_steps).toBe(10000);
    expect(result.goalMet).toBe(false);
    expect(Number.isNaN(result.pct)).toBe(false);
  });

  it('exactly at target (10000/10000) → pct=100, remaining_steps=0, goalMet=true', () => {
    const result = computeProgress({ effective_steps: 10000 }, 10000);
    expect(result.pct).toBe(100);
    expect(result.remaining_steps).toBe(0);
    expect(result.goalMet).toBe(true);
  });

  it('1 step over target → pct capped at 100, remaining_steps clamped to 0', () => {
    const result = computeProgress({ effective_steps: 10001 }, 10000);
    expect(result.pct).toBe(100);
    expect(result.remaining_steps).toBe(0);
    expect(result.goalMet).toBe(true);
  });

  it('steps far above the goal → pct clamps to 100, remaining_steps clamps to 0', () => {
    const result = computeProgress({ effective_steps: 42000 }, 5000);
    expect(result.pct).toBe(100);
    expect(result.remaining_steps).toBe(0);
    expect(result.goalMet).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeProgress — absent / corrupt record (guard clauses)
// ---------------------------------------------------------------------------
describe('computeProgress — absent record', () => {
  it('null todayRecord → all-zero step shape, no throw', () => {
    expect(computeProgress(null, 10000)).toStrictEqual({
      steps: 0,
      target_steps: 10000,
      pct: 0,
      remaining_steps: 10000,
      goalMet: false,
    });
  });

  it('undefined todayRecord → same all-zero shape', () => {
    const result = computeProgress(undefined, 10000);
    expect(result.steps).toBe(0);
    expect(result.pct).toBe(0);
    expect(result.goalMet).toBe(false);
  });

  it('non-finite effective_steps → steps = 0', () => {
    expect(computeProgress({ effective_steps: NaN }, 10000).steps).toBe(0);
    expect(computeProgress({ effective_steps: Infinity }, 10000).steps).toBe(0);
    expect(computeProgress({}, 10000).steps).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeProgress — corrupt / absent stepGoal (fail-open guard)
// ---------------------------------------------------------------------------
describe('computeProgress — corrupt stepGoal fails open', () => {
  const RECORD = { effective_steps: 3200 };
  const BAD_GOALS = [0, NaN, undefined, null, -1, Infinity, '10000', {}];

  it.each(BAD_GOALS)('stepGoal %o → falls open to DEFAULT_STEP_GOAL', (badGoal) => {
    const result = computeProgress(RECORD, badGoal);
    expect(result.target_steps).toBe(DEFAULT_STEP_GOAL);
    expect(result.target_steps).toBe(10000);
  });

  it.each(BAD_GOALS)('stepGoal %o → no NaN or Infinity in any numeric field', (badGoal) => {
    const result = computeProgress(RECORD, badGoal);
    for (const val of Object.values(result)) {
      if (typeof val === 'number') {
        expect(Number.isNaN(val)).toBe(false);
        expect(Number.isFinite(val)).toBe(true);
      }
    }
  });

  it('both record and goal absent → zero-state with default target', () => {
    expect(computeProgress(null, null)).toStrictEqual({
      steps: 0,
      target_steps: DEFAULT_STEP_GOAL,
      pct: 0,
      remaining_steps: DEFAULT_STEP_GOAL,
      goalMet: false,
    });
  });
});

// ---------------------------------------------------------------------------
// ST-006 Task 7 — Effective-field classification regression (computeProgress)
// ---------------------------------------------------------------------------

describe('computeProgress — effective_* field regression (ST-006 Task 7)', () => {
  // Divergent-field fixture: original_steps is well below the goal,
  // but effective_steps (after override) exceeds it.
  // computeProgress must read effective_steps, so goalMet should be true.

  it('tracks effective_steps, not original_steps, for progress metrics', () => {
    // Simulated override record: original was 800 steps, effective is 5500
    const record = {
      original_steps: 800,
      effective_steps: 5500,
      is_overridden: true,
    };

    const result = computeProgress(record, 5000);

    // If engine reads effective_steps (5500), goalMet = true, steps = 5500
    // If it reads original_steps (800), goalMet = false, steps = 800
    expect(result.steps).toBe(5500);
    expect(result.goalMet).toBe(true);
    expect(result.pct).toBe(100);
    expect(result.remaining_steps).toBe(0);
  });

  it('uses the downward-overridden effective_steps when it is lower than original', () => {
    const record = {
      original_steps: 9000,
      effective_steps: 3000,
      is_overridden: true,
    };

    const result = computeProgress(record, 10000);
    expect(result.steps).toBe(3000);
    expect(result.pct).toBe(30);
    expect(result.goalMet).toBe(false);
  });
});
