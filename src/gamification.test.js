/**
 * gamification.test.js
 * TDD test suite for src/gamification.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LEVEL_RANKS,
  computeXP,
  computeLevel,
  evaluateAchievements,
  createGamification,
} from './gamification.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal daily record */
function makeRecord(date, effectiveSteps, hourlySteps = null) {
  return { date, effective_steps: effectiveSteps, hourly_steps: hourlySteps };
}

/** Build a 24-element hourly_steps array with a known value at a slot */
function makeHourly(slotValues = {}) {
  const arr = new Array(24).fill(0);
  for (const [slot, val] of Object.entries(slotValues)) {
    arr[Number(slot)] = val;
  }
  return arr;
}

// ---------------------------------------------------------------------------
// LEVEL_RANKS
// ---------------------------------------------------------------------------
describe('LEVEL_RANKS', () => {
  it('has exactly 50 entries', () => {
    expect(LEVEL_RANKS).toHaveLength(50);
  });

  it('LEVEL_RANKS[0] is "Couch Potato"', () => {
    expect(LEVEL_RANKS[0]).toBe('Couch Potato');
  });

  it('LEVEL_RANKS[49] is "Globe Trotter"', () => {
    expect(LEVEL_RANKS[49]).toBe('Globe Trotter');
  });
});

// ---------------------------------------------------------------------------
// computeXP
// ---------------------------------------------------------------------------
describe('computeXP', () => {
  it('returns 0 for 0 steps', () => {
    expect(computeXP(0)).toBe(0);
  });

  it('returns 100 for 10000 steps', () => {
    expect(computeXP(10000)).toBe(100);
  });

  it('floors fractional XP', () => {
    expect(computeXP(150)).toBe(1); // 150/100 = 1.5 → 1
  });

  it('returns 0 for negative input', () => {
    expect(computeXP(-1)).toBe(0);
  });

  it('returns 0 for NaN', () => {
    expect(computeXP(NaN)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(computeXP(Infinity)).toBe(0);
  });

  it('returns 0 for -Infinity', () => {
    expect(computeXP(-Infinity)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeLevel
// ---------------------------------------------------------------------------
describe('computeLevel', () => {
  it('returns 1 for XP = 0', () => {
    expect(computeLevel(0)).toBe(1);
  });

  it('returns 1 for XP < 0 (guard clause)', () => {
    expect(computeLevel(-1)).toBe(1);
  });

  it('returns a value between 1 and 50 inclusive for valid XP', () => {
    for (const xp of [0, 10, 100, 1000, 10000, 1_000_000]) {
      const level = computeLevel(xp);
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(50);
    }
  });

  it('never exceeds 50 even for very large XP', () => {
    expect(computeLevel(999_999_999)).toBe(50);
  });

  it('grows with XP (monotonically non-decreasing up to cap)', () => {
    const l1 = computeLevel(100);
    const l2 = computeLevel(10000);
    expect(l2).toBeGreaterThanOrEqual(l1);
  });
});

// ---------------------------------------------------------------------------
// evaluateAchievements — empty records
// ---------------------------------------------------------------------------
describe('evaluateAchievements — empty records', () => {
  it('returns all trophies locked for empty array', () => {
    const result = evaluateAchievements([], 8000);
    expect(result).toEqual({
      centurion: false,
      marathoner: false,
      unstoppable: false,
      nightOwl: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Centurion trophy
// ---------------------------------------------------------------------------
describe('evaluateAchievements — Centurion', () => {
  /**
   * ISO week 2026-W32 runs Mon 2026-08-03 → Sun 2026-08-09.
   * ISO week 2026-W33 runs Mon 2026-08-10 → Sun 2026-08-16.
   */

  it('unlocks when ISO week total equals 100_001', () => {
    // Spread across the same ISO week (2026-W32)
    const records = [
      makeRecord('2026-08-03', 50001), // Mon
      makeRecord('2026-08-04', 50000), // Tue  → total 100_001
    ];
    const { centurion } = evaluateAchievements(records, 8000);
    expect(centurion).toBe(true);
  });

  it('stays locked when ISO week total equals exactly 100_000', () => {
    const records = [
      makeRecord('2026-08-03', 50000),
      makeRecord('2026-08-04', 50000),
    ];
    const { centurion } = evaluateAchievements(records, 8000);
    expect(centurion).toBe(false);
  });

  it('correctly splits Sunday and Monday into different ISO weeks', () => {
    // 2026-08-09 is Sunday → W32; 2026-08-10 is Monday → W33
    const records = [
      makeRecord('2026-08-09', 60000), // Sun W32 — 60 000 alone, not > 100 000
      makeRecord('2026-08-10', 60000), // Mon W33 — 60 000 alone, not > 100 000
    ];
    const { centurion } = evaluateAchievements(records, 8000);
    expect(centurion).toBe(false);
  });

  it('unlocks when a single Sunday is combined with other same-week days to exceed 100 000', () => {
    // W32: Mon–Sun 2026-08-03 … 2026-08-09
    const records = [
      makeRecord('2026-08-03', 80000), // Mon W32
      makeRecord('2026-08-09', 21000), // Sun W32  → 101 000 in W32
    ];
    const { centurion } = evaluateAchievements(records, 8000);
    expect(centurion).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Marathoner trophy
// ---------------------------------------------------------------------------
describe('evaluateAchievements — Marathoner', () => {
  it('unlocks when a single day has 55_001 steps', () => {
    const records = [makeRecord('2026-01-01', 55001)];
    const { marathoner } = evaluateAchievements(records, 8000);
    expect(marathoner).toBe(true);
  });

  it('stays locked when single-day best equals exactly 55_000', () => {
    const records = [makeRecord('2026-01-01', 55000)];
    const { marathoner } = evaluateAchievements(records, 8000);
    expect(marathoner).toBe(false);
  });

  it('stays locked when all days below threshold', () => {
    const records = [
      makeRecord('2026-01-01', 10000),
      makeRecord('2026-01-02', 20000),
    ];
    const { marathoner } = evaluateAchievements(records, 8000);
    expect(marathoner).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unstoppable trophy
// ---------------------------------------------------------------------------
describe('evaluateAchievements — Unstoppable', () => {
  /**
   * Build 30 consecutive records all meeting stepGoal.
   * computeToleranceStreaks needs `today` — we mock the module import so we
   * can verify delegation without requiring real streak logic here.
   * However, the spec says "delegates to computeToleranceStreaks from streak.js"
   * so we rely on the real implementation; we'll just build real data.
   */

  function buildConsecutiveRecords(start, count, steps) {
    const records = [];
    const d = new Date(start + 'T00:00:00Z');
    for (let i = 0; i < count; i++) {
      const dateStr = d.toISOString().slice(0, 10);
      records.push(makeRecord(dateStr, steps));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return records;
  }

  it('unlocks when 30-day streak achieved (all days meet goal)', () => {
    const records = buildConsecutiveRecords('2026-01-01', 30, 8000);
    const { unstoppable } = evaluateAchievements(records, 8000);
    expect(unstoppable).toBe(true);
  });

  it('stays locked when streak is 29 days', () => {
    const records = buildConsecutiveRecords('2026-01-01', 29, 8000);
    const { unstoppable } = evaluateAchievements(records, 8000);
    expect(unstoppable).toBe(false);
  });

  it('stays locked with empty records', () => {
    const { unstoppable } = evaluateAchievements([], 8000);
    expect(unstoppable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Night Owl trophy
// ---------------------------------------------------------------------------
describe('evaluateAchievements — Night Owl', () => {
  it('unlocks when valid consecutive pair cross-midnight sum exceeds 2_000', () => {
    // hour 23 of day N = 1000, hours 0+1+2 of day N+1 = 600+300+200 = 1100
    // total = 2100 > 2000 → unlock
    const h1 = makeHourly({ 23: 1000 });
    const h2 = makeHourly({ 0: 600, 1: 300, 2: 200 });
    const records = [
      makeRecord('2026-01-01', 5000, h1),
      makeRecord('2026-01-02', 5000, h2),
    ];
    const { nightOwl } = evaluateAchievements(records, 8000);
    expect(nightOwl).toBe(true);
  });

  it('stays locked when cross-midnight sum equals exactly 2_000', () => {
    // sum = 2000 (not > 2000)
    const h1 = makeHourly({ 23: 1000 });
    const h2 = makeHourly({ 0: 500, 1: 300, 2: 200 });
    const records = [
      makeRecord('2026-01-01', 5000, h1),
      makeRecord('2026-01-02', 5000, h2),
    ];
    const { nightOwl } = evaluateAchievements(records, 8000);
    expect(nightOwl).toBe(false);
  });

  it('skips pair when record N has hourly_steps: null', () => {
    const h2 = makeHourly({ 0: 1000, 1: 500, 2: 600 });
    const records = [
      makeRecord('2026-01-01', 5000, null),  // null → pair skipped
      makeRecord('2026-01-02', 5000, h2),
    ];
    const { nightOwl } = evaluateAchievements(records, 8000);
    expect(nightOwl).toBe(false);
  });

  it('skips pair when record N+1 has hourly_steps that is not 24 elements', () => {
    const h1 = makeHourly({ 23: 2000 });
    const shortArr = [100, 200]; // not 24 elements
    const records = [
      makeRecord('2026-01-01', 5000, h1),
      makeRecord('2026-01-02', 5000, shortArr),
    ];
    const { nightOwl } = evaluateAchievements(records, 8000);
    expect(nightOwl).toBe(false);
  });

  it('stays locked with fewer than 2 records', () => {
    const h1 = makeHourly({ 23: 9999 });
    const records = [makeRecord('2026-01-01', 5000, h1)];
    const { nightOwl } = evaluateAchievements(records, 8000);
    expect(nightOwl).toBe(false);
  });

  it('stays locked with zero records', () => {
    const { nightOwl } = evaluateAchievements([], 8000);
    expect(nightOwl).toBe(false);
  });

  it('evaluates across multiple consecutive pairs and unlocks if any qualifies', () => {
    // Pair (day1, day2): sum = 500 → locked
    // Pair (day2, day3): sum = 2001 → unlock
    const h1 = makeHourly({ 23: 100 });
    const h2 = makeHourly({ 0: 100, 1: 200, 2: 100, 23: 1500 });
    const h3 = makeHourly({ 0: 400, 1: 50, 2: 51 });
    const records = [
      makeRecord('2026-01-01', 5000, h1),
      makeRecord('2026-01-02', 5000, h2),
      makeRecord('2026-01-03', 5000, h3),
    ];
    // pair(1,2): h1[23]=100 + h2[0]=100 + h2[1]=200 + h2[2]=100 = 500 → no
    // pair(2,3): h2[23]=1500 + h3[0]=400 + h3[1]=50 + h3[2]=51 = 2001 → yes
    const { nightOwl } = evaluateAchievements(records, 8000);
    expect(nightOwl).toBe(true);
  });

  it('skips a null-hourly record as day N+1 as well', () => {
    const h1 = makeHourly({ 23: 9999 });
    const records = [
      makeRecord('2026-01-01', 5000, h1),
      makeRecord('2026-01-02', 5000, null), // null as N+1 → skipped
    ];
    const { nightOwl } = evaluateAchievements(records, 8000);
    expect(nightOwl).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Level label — (MAX) suffix
// ---------------------------------------------------------------------------
import { getLevelLabel } from './gamification.js';

describe('Level label (MAX) suffix', () => {
  it('appends "(MAX)" when raw computed level exceeds 50', () => {
    // XP so large that Math.floor(Math.sqrt(xp/10))+1 >> 50
    // e.g. xp = 99_000_000 → sqrt(9_900_000) ≈ 3146.4 → level 3147 > 50
    const highXP = 99_000_000;
    const rawLevel = Math.floor(Math.sqrt(highXP / 10)) + 1;
    expect(rawLevel).toBeGreaterThan(50);

    // getLevelLabel takes lifetime steps; compute XP internally
    // lifetimeSteps = highXP * 100 to produce high XP
    const lifetimeSteps = highXP * 100;
    const label = getLevelLabel(lifetimeSteps);
    expect(label).toMatch(/\(MAX\)$/);
    expect(label).toContain('Globe Trotter');
  });
});

// ---------------------------------------------------------------------------
// createGamification factory
// ---------------------------------------------------------------------------
describe('createGamification', () => {
  function makeDb(records, goalValue) {
    return {
      daily_records: {
        toArray: vi.fn().mockResolvedValue(records),
      },
      settings: {
        get: vi.fn().mockImplementation((key) => {
          if (key === 'active_step_goal') return Promise.resolve({ value: goalValue });
          return Promise.resolve(undefined);
        }),
        put: vi.fn().mockResolvedValue(undefined),
      },
    };
  }

  it('returns xp, level, levelLabel, achievements from compute()', async () => {
    const db = makeDb([], 8000);
    const gamification = createGamification(db);
    const result = await gamification.compute();
    expect(result).toHaveProperty('xp');
    expect(result).toHaveProperty('level');
    expect(result).toHaveProperty('levelLabel');
    expect(result).toHaveProperty('achievements');
  });

  it('persists achievements to db.settings with key "achievements"', async () => {
    const db = makeDb([], 8000);
    const gamification = createGamification(db);
    await gamification.compute();
    expect(db.settings.put).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'achievements' }),
    );
  });

  it('uses active_step_goal from settings for achievement evaluation', async () => {
    // 30-day streak meeting goal 8000
    const records = [];
    const d = new Date('2026-01-01T00:00:00Z');
    for (let i = 0; i < 30; i++) {
      records.push(makeRecord(d.toISOString().slice(0, 10), 9000));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    const db = makeDb(records, 8000);
    const gamification = createGamification(db);
    const result = await gamification.compute();
    expect(result.achievements.unstoppable).toBe(true);
  });

  it('handles missing active_step_goal setting gracefully', async () => {
    const db = {
      daily_records: { toArray: vi.fn().mockResolvedValue([]) },
      settings: {
        get: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
      },
    };
    const gamification = createGamification(db);
    await expect(gamification.compute()).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// No DOM or Dexie symbols
// ---------------------------------------------------------------------------
describe('gamification.js — no DOM or Dexie imports', () => {
  it('source file does not import DOM or Dexie symbols', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    // __dirname equivalent in vitest
    const dir = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
    const filePath = resolve(dir, 'gamification.js');
    const src = readFileSync(filePath, 'utf8');
    // Must not import from dexie / dexie-observable
    expect(src).not.toMatch(/from\s+['"]dexie/);
    // Must not reference document/window/HTMLElement directly in imports
    expect(src).not.toMatch(/import\s+.*\bdocument\b/);
    expect(src).not.toMatch(/import\s+.*\bwindow\b/);
  });
});

// ---------------------------------------------------------------------------
// Task 16: Pre-sort once in evaluateAchievements (ST-009 performance fix)
//
// These tests verify that sub-evaluators work correctly when records are
// delivered in non-chronological order. With the pre-sort refactoring,
// evaluateAchievements sorts once and passes the sorted array to each
// sub-evaluator instead of each sub-evaluator sorting independently.
// ---------------------------------------------------------------------------
describe('evaluateAchievements — pre-sort once (Task 16)', () => {
  it('NightOwl unlocks when qualifying consecutive pair is passed in reverse date order', () => {
    // h1[23]=1000, h2[0+1+2]=600+300+101 = 1001 → sum = 2001 > 2000 → unlock
    // Records deliberately passed newest-first; pre-sort must reorder them.
    const h1 = makeHourly({ 23: 1000 });
    const h2 = makeHourly({ 0: 600, 1: 300, 2: 101 });
    const records = [
      makeRecord('2026-01-02', 5000, h2), // later date first (reverse order)
      makeRecord('2026-01-01', 5000, h1),
    ];
    const { nightOwl } = evaluateAchievements(records, 8000);
    expect(nightOwl).toBe(true);
  });

  it('NightOwl stays locked when records in reverse order do not qualify', () => {
    // sum = 500 ≤ 2000 → locked regardless of order
    const h1 = makeHourly({ 23: 100 });
    const h2 = makeHourly({ 0: 200, 1: 100, 2: 100 });
    const records = [
      makeRecord('2026-01-02', 5000, h2),
      makeRecord('2026-01-01', 5000, h1),
    ];
    const { nightOwl } = evaluateAchievements(records, 8000);
    expect(nightOwl).toBe(false);
  });

  it('Unstoppable unlocks when 30-day streak records are passed in reverse date order', () => {
    const recs = [];
    const d = new Date('2026-01-01T00:00:00Z');
    for (let i = 0; i < 30; i++) {
      recs.push(makeRecord(d.toISOString().slice(0, 10), 8000));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    // Reverse so earliest date is last
    recs.reverse();
    const { unstoppable } = evaluateAchievements(recs, 8000);
    expect(unstoppable).toBe(true);
  });
});
