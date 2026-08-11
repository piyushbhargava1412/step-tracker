/**
 * Tests for src/progress.js — pure computation + today's data resolution.
 * No mocking needed for computeProgress — pure function with inline fixtures.
 * getTodayRecord and _formatLocalDate tested with simple stubs.
 */

import { computeProgress, getTodayRecord } from './progress.js';
import { _localDate as _formatLocalDate } from './goal.js';

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
    const mockGet = vi.fn().mockResolvedValue({ effective_steps: 100, effective_distance_km: 0.08 });
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
    const record = { effective_steps: 3200, effective_distance_km: 2.44 };
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
// computeProgress — Scenario 3 (canonical fixture)
// ---------------------------------------------------------------------------
describe('computeProgress — Scenario 3', () => {
  const activeGoal = { target_steps: 5000, target_distance_km: 3.81 };

  it('3200 / 5000 → pct=64, remaining_steps=1800, remaining_m=1372, goalMet=false', () => {
    const record = { effective_steps: 3200, effective_distance_km: 2.44 };
    const result = computeProgress(record, activeGoal);

    expect(result.steps).toBe(3200);
    expect(result.distance_km).toBe(2.44);
    expect(result.target_steps).toBe(5000);
    expect(result.pct).toBe(64);
    expect(result.remaining_steps).toBe(1800);
    expect(result.remaining_m).toBe(1372); // Math.round(1800/1312.33 * 1000)
    expect(result.goalMet).toBe(false);
  });

  it('remaining_km ≈ 1.37 (≥ 1.0 km branch)', () => {
    const record = { effective_steps: 3200, effective_distance_km: 2.44 };
    const result = computeProgress(record, activeGoal);

    expect(result.remaining_km).toBeCloseTo(1.37, 1);
    expect(result.remaining_km).toBeGreaterThanOrEqual(1.0);
  });
});

// ---------------------------------------------------------------------------
// computeProgress — boundary values
// ---------------------------------------------------------------------------
describe('computeProgress — boundary values', () => {
  const goal5k = { target_steps: 5000, target_distance_km: 3.81 };

  it('0 steps → pct=0, remaining_steps=5000, goalMet=false, no NaN', () => {
    const result = computeProgress({ effective_steps: 0, effective_distance_km: 0 }, goal5k);
    expect(result.pct).toBe(0);
    expect(result.remaining_steps).toBe(5000);
    expect(result.goalMet).toBe(false);
    expect(Number.isNaN(result.pct)).toBe(false);
    expect(Number.isNaN(result.remaining_km)).toBe(false);
  });

  it('exactly at target (5000/5000) → pct=100, remaining_steps=0, remaining_m=0, goalMet=true', () => {
    const result = computeProgress({ effective_steps: 5000, effective_distance_km: 3.81 }, goal5k);
    expect(result.pct).toBe(100);
    expect(result.remaining_steps).toBe(0);
    expect(result.remaining_m).toBe(0);
    expect(result.goalMet).toBe(true);
  });

  it('1 step over target (5001/5000) → pct capped at 100, goalMet=true', () => {
    const result = computeProgress({ effective_steps: 5001, effective_distance_km: 3.82 }, goal5k);
    expect(result.pct).toBe(100);
    expect(result.goalMet).toBe(true);
    expect(result.remaining_steps).toBe(0);
  });

  it('200 remaining steps → remaining_m=152, remaining_km < 1.0', () => {
    // 5000 - 4800 = 200 remaining
    const result = computeProgress({ effective_steps: 4800, effective_distance_km: 3.65 }, goal5k);
    expect(result.remaining_steps).toBe(200);
    expect(result.remaining_m).toBe(152); // Math.round(200/1312.33 * 1000)
    expect(result.remaining_km).toBeLessThan(1.0);
  });

  it('1800 remaining steps → remaining_km ≥ 1.0, ≈ 1.37', () => {
    const result = computeProgress({ effective_steps: 3200, effective_distance_km: 2.44 }, goal5k);
    expect(result.remaining_steps).toBe(1800);
    expect(result.remaining_km).toBeGreaterThanOrEqual(1.0);
    expect(result.remaining_km).toBeCloseTo(1.37, 1);
  });

  it('distance_km = 0.0 when record has 0 effective_distance_km', () => {
    const result = computeProgress({ effective_steps: 200, effective_distance_km: 0 }, goal5k);
    expect(result.distance_km).toBe(0);
    expect(result.distance_km.toFixed(2)).toBe('0.00');
  });
});

// ---------------------------------------------------------------------------
// computeProgress — absent / null record (guard clauses)
// ---------------------------------------------------------------------------
describe('computeProgress — absent record', () => {
  const goal5k = { target_steps: 5000, target_distance_km: 3.81 };

  it('null todayRecord → defaults to 0 steps / 0.0 km, no throw', () => {
    const result = computeProgress(null, goal5k);
    expect(result.steps).toBe(0);
    expect(result.distance_km).toBe(0);
    expect(result.pct).toBe(0);
    expect(result.goalMet).toBe(false);
  });

  it('undefined todayRecord → same defaults', () => {
    const result = computeProgress(undefined, goal5k);
    expect(result.steps).toBe(0);
    expect(result.distance_km).toBe(0);
    expect(result.pct).toBe(0);
    expect(result.goalMet).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeProgress — corrupt / absent activeGoal (guard clauses)
// ---------------------------------------------------------------------------
describe('computeProgress — corrupt activeGoal', () => {
  const record3200 = { effective_steps: 3200, effective_distance_km: 2.44 };
  const DEFAULT_GOAL_STEPS = 3937; // 3.0 * 1312.33 rounded

  it('null activeGoal → fail-open to default (3937 steps), no throw', () => {
    const result = computeProgress(record3200, null);
    expect(result.target_steps).toBe(DEFAULT_GOAL_STEPS);
    expect(Number.isNaN(result.pct)).toBe(false);
    expect(Number.isFinite(result.pct)).toBe(true);
  });

  it('non-finite target_steps (NaN) → fail-open to 3937, no NaN', () => {
    const result = computeProgress(record3200, { target_steps: NaN, target_distance_km: 3.0 });
    expect(result.target_steps).toBe(DEFAULT_GOAL_STEPS);
    expect(Number.isNaN(result.pct)).toBe(false);
  });

  it('non-finite target_steps (Infinity) → fail-open to 3937', () => {
    const result = computeProgress(record3200, { target_steps: Infinity, target_distance_km: 3.0 });
    expect(result.target_steps).toBe(DEFAULT_GOAL_STEPS);
  });

  it('non-finite target_distance_km → fail-open to 3937', () => {
    const result = computeProgress(record3200, { target_steps: 5000, target_distance_km: NaN });
    expect(result.target_steps).toBe(DEFAULT_GOAL_STEPS);
  });

  it('target_steps = 0 → pct=0, goalMet=false, no Infinity/NaN (division-by-zero guard)', () => {
    const result = computeProgress(record3200, { target_steps: 0, target_distance_km: 0 });
    expect(result.pct).toBe(0);
    expect(result.goalMet).toBe(false);
    expect(Number.isNaN(result.pct)).toBe(false);
    expect(Number.isFinite(result.pct)).toBe(true);
  });

  it('absent target_steps (undefined) → fail-open to 3937', () => {
    const result = computeProgress(record3200, { target_distance_km: 3.0 });
    expect(result.target_steps).toBe(DEFAULT_GOAL_STEPS);
  });

  it('result contains no NaN or Infinity fields for any corrupt input', () => {
    const result = computeProgress(null, null);
    for (const [key, val] of Object.entries(result)) {
      if (typeof val === 'number') {
        expect(Number.isNaN(val)).toBe(false);
        expect(Number.isFinite(val)).toBe(true);
      }
    }
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
    const activeGoal = { target_steps: 5000, target_distance_km: 3.81 };
    // Simulated override record: original was 800 steps, effective is 5500
    const record = {
      original_steps: 800,
      original_distance_km: 0.61,
      effective_steps: 5500,
      effective_distance_km: 4.19,
      is_overridden: true,
    };

    const result = computeProgress(record, activeGoal);

    // If engine reads effective_steps (5500), goalMet = true, steps = 5500
    // If it reads original_steps (800), goalMet = false, steps = 800
    expect(result.steps).toBe(5500);
    expect(result.distance_km).toBe(4.19);
    expect(result.goalMet).toBe(true);
    expect(result.pct).toBe(100);
    expect(result.remaining_steps).toBe(0);
  });

  it('distance_km reflects effective_distance_km when original_distance_km diverges', () => {
    const activeGoal = { target_steps: 5000, target_distance_km: 3.81 };
    const record = {
      original_steps: 3000,
      original_distance_km: 2.29,        // different from effective
      effective_steps: 3000,
      effective_distance_km: 1.5,        // effective overridden to lower value
      is_overridden: true,
    };

    const result = computeProgress(record, activeGoal);
    expect(result.distance_km).toBe(1.5);  // must be effective, not original
  });
});
