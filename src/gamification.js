/**
 * gamification.js — Pure gamification engine.
 *
 * No DOM or Dexie imports. All functions are pure except createGamification()
 * which returns a factory whose compute() method reads from and writes to the
 * Dexie database passed in via dependency injection.
 */

import { computeToleranceStreaks } from './streak.js';
import { DEFAULT_STEP_GOAL } from './config.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** @type {string[]} 50-entry rank labels. Index 0 = Level 1, index 49 = Level 50. */
export const LEVEL_RANKS = [
  'Couch Potato',       //  1
  'Casual Stroller',    //  2
  'Weekend Walker',     //  3
  'Pavement Pacer',     //  4
  'Sidewalk Strider',   //  5
  'Park Wanderer',      //  6
  'Trail Trotter',      //  7
  'Brisk Mover',        //  8
  'Daily Stepper',      //  9
  'Active Soul',        // 10
  'Mile Muncher',       // 11
  'Block Buster',       // 12
  'Step Stacker',       // 13
  'Neighborhood Nomad', // 14
  'Fitness Fledgling',  // 15
  'Endurance Starter',  // 16
  'Determined Walker',  // 17
  'Committed Pacer',    // 18
  'Steady Strider',     // 19
  'Distance Devotee',   // 20
  'Route Runner',       // 21
  'Pathfinder',         // 22
  'Trail Blazer',       // 23
  'Kilometer Crusher',  // 24
  'Step Sovereign',     // 25
  'Mileage Maker',      // 26
  'Terrain Tackler',    // 27
  'Endurance Explorer', // 28
  'Peak Pursuer',       // 29
  'Horizon Chaser',     // 30
  'Distance Drifter',   // 31
  'Wandering Warrior',  // 32
  'Leg Legend',         // 33
  'Stride Sage',        // 34
  'Epic Walker',        // 35
  'Continent Crosser',  // 36
  'Borderless Rambler', // 37
  'World Wanderer',     // 38
  'Summit Seeker',      // 39
  'Odyssey Walker',     // 40
  'Ultra Strider',      // 41
  'Marathon Maestro',   // 42
  'Boundless Pacer',    // 43
  'Infinite Stepper',   // 44
  'Legendary Rover',    // 45
  'Titan Trekker',      // 46
  'Apex Adventurer',    // 47
  'Elite Expeditioner', // 48
  'Grand Voyager',      // 49
  'Globe Trotter',      // 50
];

// Centurion: > 100 000 steps in a single ISO week
const CENTURION_WEEKLY_THRESHOLD = 100_000;

// Marathoner: > 55 000 steps in a single day
const MARATHONER_DAILY_THRESHOLD = 55_000;

// Unstoppable: streak actual >= 30 days
const UNSTOPPABLE_STREAK_DAYS = 30;

// Night Owl: cross-midnight window sum > 2 000
const NIGHT_OWL_THRESHOLD = 2_000;

// ---------------------------------------------------------------------------
// XP & Level
// ---------------------------------------------------------------------------

/**
 * Compute XP from lifetime steps.
 * @param {number} lifetimeSteps
 * @returns {number}
 */
export function computeXP(lifetimeSteps) {
  if (!Number.isFinite(lifetimeSteps) || lifetimeSteps < 0) return 0;
  return Math.floor(lifetimeSteps / 100);
}

/**
 * Compute level (1–50) from XP.
 * Formula: Math.min(Math.floor(Math.sqrt(xp / 10)) + 1, 50)
 * @param {number} xp
 * @returns {number}
 */
export function computeLevel(xp) {
  if (!Number.isFinite(xp) || xp < 0) return 1;
  return Math.min(Math.floor(Math.sqrt(xp / 10)) + 1, 50);
}

/**
 * Get the display label for a given lifetime-steps count.
 * Appends "(MAX)" when the raw computed level exceeds 50.
 * @param {number} lifetimeSteps
 * @returns {string}
 */
export function getLevelLabel(lifetimeSteps) {
  const xp = computeXP(lifetimeSteps);
  const rawLevel = Number.isFinite(xp) && xp >= 0
    ? Math.floor(Math.sqrt(xp / 10)) + 1
    : 1;
  const cappedLevel = Math.min(rawLevel, 50);
  const baseLabel = LEVEL_RANKS[Math.min(cappedLevel - 1, 49)];
  return rawLevel > 50 ? `${baseLabel} (MAX)` : baseLabel;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Ascending date comparator for Array.sort — reused by multiple evaluators. */
const _BY_DATE_ASC = (a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0);

// ---------------------------------------------------------------------------
// ISO week key (SF-12)
// ---------------------------------------------------------------------------

/**
 * Return the ISO 8601 year-week key for a YYYY-MM-DD string, e.g. "2026-W32".
 * ISO weeks start on Monday; the week containing the year's first Thursday
 * belongs to that year.
 *
 * @param {string} dateStr  YYYY-MM-DD
 * @returns {string}  e.g. "2026-W32"
 */
function _isoWeekKey(dateStr) {
  const date = new Date(dateStr + 'T00:00:00Z');
  // Day of week: 0=Sun … 6=Sat → shift to Mon=0 … Sun=6
  const dow = (date.getUTCDay() + 6) % 7;
  // Nearest Thursday: determines ISO year
  const thursday = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + (4 - dow),
  ));
  const isoYear = thursday.getUTCFullYear();
  // Jan 4 of the ISO year is always in week 1
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7;
  const weekOneMonday = new Date(Date.UTC(isoYear, 0, 4 - jan4Dow));
  // Week number
  const msPerWeek = 7 * 24 * 3600 * 1000;
  const weekNum = Math.floor(
    (date.getTime() - weekOneMonday.getTime()) / msPerWeek,
  ) + 1;
  return `${isoYear}-W${String(weekNum).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Trophy helpers
// ---------------------------------------------------------------------------

/**
 * Centurion: any ISO week with total effective_steps > 100 000.
 * @param {Array<{ date: string, effective_steps: number }>} records
 * @returns {boolean}
 */
function _evaluateCenturion(records) {
  const weekTotals = new Map();
  for (const r of records) {
    if (typeof r.date !== 'string' || !Number.isFinite(r.effective_steps)) continue;
    const key = _isoWeekKey(r.date);
    weekTotals.set(key, (weekTotals.get(key) ?? 0) + r.effective_steps);
  }
  for (const total of weekTotals.values()) {
    if (total > CENTURION_WEEKLY_THRESHOLD) return true;
  }
  return false;
}

/**
 * Marathoner: any single-day effective_steps > 55 000.
 * @param {Array<{ effective_steps: number }>} records
 * @returns {boolean}
 */
function _evaluateMarathoner(records) {
  return records.some(
    (r) => Number.isFinite(r.effective_steps) && r.effective_steps > MARATHONER_DAILY_THRESHOLD,
  );
}

/**
 * Unstoppable: delegates to computeToleranceStreaks; unlocked when actual >= 30.
 * Uses the most recent record date as `today` so we don't depend on wall clock.
 * @param {Array<{ date: string, effective_steps: number }>} records
 * @param {number} activeStepGoal
 * @returns {boolean}
 */
function _evaluateUnstoppable(records, activeStepGoal) {
  if (!Array.isArray(records) || records.length === 0) return false;
  // records is pre-sorted ascending by evaluateAchievements — last entry is the latest date.
  const today = records[records.length - 1].date;
  const streaks = computeToleranceStreaks(records, activeStepGoal, today);
  return streaks.actual >= UNSTOPPABLE_STREAK_DAYS;
}

/**
 * Night Owl: iterates consecutive record pairs (sorted ascending by date);
 * sums records[N].hourly_steps[23] + records[N+1].hourly_steps[0..2];
 * returns true if any pair sum > 2 000.
 * Skips pairs where either record has null or non-24-element hourly_steps.
 *
 * @param {Array<{ date: string, hourly_steps: number[]|null }>} records
 * @returns {boolean}
 */
function _evaluateNightOwl(records) {
  if (!Array.isArray(records) || records.length < 2) return false;
  // records is pre-sorted ascending by evaluateAchievements.
  for (let i = 0; i < records.length - 1; i++) {
    const rN = records[i];
    const rNext = records[i + 1];
    const hN = rN.hourly_steps;
    const hNext = rNext.hourly_steps;
    if (!Array.isArray(hN) || hN.length !== 24) continue;
    if (!Array.isArray(hNext) || hNext.length !== 24) continue;
    const windowSum = hN[23] + hNext[0] + hNext[1] + hNext[2];
    if (windowSum > NIGHT_OWL_THRESHOLD) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// evaluateAchievements
// ---------------------------------------------------------------------------

/**
 * Evaluate all four achievement trophies from raw records.
 *
 * @param {Array} records       daily_records rows
 * @param {number} activeStepGoal
 * @returns {{ centurion: boolean, marathoner: boolean, unstoppable: boolean, nightOwl: boolean }}
 */
export function evaluateAchievements(records, activeStepGoal) {
  if (!Array.isArray(records) || records.length === 0) {
    return { centurion: false, marathoner: false, unstoppable: false, nightOwl: false };
  }
  // Sort once here; pass the sorted array to sub-evaluators that need date order,
  // so neither _evaluateUnstoppable nor _evaluateNightOwl has to sort again.
  const sorted = [...records].sort(_BY_DATE_ASC);
  return {
    centurion: _evaluateCenturion(sorted),
    marathoner: _evaluateMarathoner(sorted),
    unstoppable: _evaluateUnstoppable(sorted, activeStepGoal),
    nightOwl: _evaluateNightOwl(sorted),
  };
}

// ---------------------------------------------------------------------------
// createGamification factory
// ---------------------------------------------------------------------------

/**
 * Factory that binds the pure engine to a Dexie database instance.
 *
 * @param {{ daily_records: object, settings: object }} db  Dexie db instance
 * @returns {{ compute(): Promise<{ xp: number, level: number, levelLabel: string, achievements: object }> }}
 */
export function createGamification(db) {
  return {
    async compute() {
      try {
        const [records, goalSetting] = await Promise.all([
          db.daily_records.toArray(),
          db.settings.get('active_step_goal'),
        ]);
        const activeStepGoal =
          goalSetting && Number.isFinite(goalSetting.value) && goalSetting.value > 0
            ? goalSetting.value
            : DEFAULT_STEP_GOAL;

        const totalSteps = records.reduce(
          (sum, r) => sum + (Number.isFinite(r.effective_steps) ? r.effective_steps : 0),
          0,
        );

        const xp = computeXP(totalSteps);
        const level = computeLevel(xp);
        const levelLabel = getLevelLabel(totalSteps);

        const achievements = evaluateAchievements(records, activeStepGoal);

        await db.settings.put({ key: 'achievements', value: achievements });

        return { xp, level, levelLabel, achievements };
      } catch (err) {
        console.error('[gamification]', err);
        throw err;
      }
    },
  };
}
