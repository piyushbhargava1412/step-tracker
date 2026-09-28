/**
 * Streak render layer — the Today panel's streak tiles.
 *
 * Fills five tiles of the Today progress panel's stat grid:
 *   #tile-strict   Strict streak (every day at 100% of the goal)
 *   #tile-tol99    99% tolerance streak + misses it used
 *   #tile-tol95    95% tolerance streak + misses it used
 *   #tile-lifetime share of all tracked days on goal
 *   #tile-best     longest strict run at the active goal
 * (#tile-distance belongs to progress-ui.js.)
 *
 * Idempotent: each render replaces tile content. Fail-open: render() never
 * throws or rejects. Every node is built with createElement/textContent.
 */

import { DEFAULT_STEP_GOAL } from './goal.js';

/** Zero-state result used when streak.compute() rejects. */
function _zeroState() {
  return {
    tolerance: { actual: 0, allowance95: 0, allowance99: 0, misses95: 0, misses99: 0 },
    hallOfFame: [],
    lifetime: { metDays: 0, totalDays: 0, pct: 0 },
    activeStepGoal: DEFAULT_STEP_GOAL,
  };
}

const fmt = (n) => Number(n).toLocaleString('en-US');
const days = (n) => `${fmt(n)} ${n === 1 ? 'day' : 'days'}`;
const misses = (n) => `${fmt(n)} ${n === 1 ? 'miss' : 'misses'} used`;

/** 10000 → "10k", 8500 → "8.5k". */
function _goalShort(stepGoal) {
  const thousands = stepGoal / 1000;
  return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`;
}

/** "2024" for a run inside one year, "2025–2026" across years. */
function _yearSpan(startDate, endDate) {
  const start = String(startDate).slice(0, 4);
  const end = String(endDate).slice(0, 4);
  return start === end ? start : `${start}–${end}`;
}

/**
 * The tiles to draw, from a streak.compute() result.
 * @returns {Array<{ id: string, label: string, value: string, sub: string, good?: boolean }>}
 */
export function _buildTiles(result) {
  const tolerance = result.tolerance ?? _zeroState().tolerance;
  const { metDays = 0, totalDays = 0, pct = 0 } = result.lifetime ?? {};
  const goal = Number.isFinite(result.activeStepGoal) ? result.activeStepGoal : DEFAULT_STEP_GOAL;
  const best = Array.isArray(result.hallOfFame) ? result.hallOfFame[0] : undefined;

  return [
    { id: 'tile-strict', label: 'Strict', value: days(tolerance.actual ?? 0), sub: 'every day at 100%' },
    {
      id: 'tile-lifetime',
      label: 'Lifetime',
      value: `${Math.round(pct)}%`,
      sub: `${fmt(metDays)} of ${fmt(totalDays)} days`,
    },
    {
      id: 'tile-tol99',
      label: '99% tol',
      value: days(tolerance.allowance99 ?? 0),
      sub: misses(tolerance.misses99 ?? 0),
      good: (tolerance.misses99 ?? 0) === 0,
    },
    {
      id: 'tile-tol95',
      label: '95% tol',
      value: days(tolerance.allowance95 ?? 0),
      sub: misses(tolerance.misses95 ?? 0),
      good: (tolerance.misses95 ?? 0) === 0,
    },
    {
      id: 'tile-best',
      label: 'Best run',
      value: best ? days(best.days) : '—',
      sub: best ? `at ${_goalShort(goal)} · ${_yearSpan(best.startDate, best.endDate)}` : 'no run yet',
    },
  ];
}

/**
 * @param {Document} doc
 * @param {{ compute: () => Promise<object> }} streak
 * @param {{ db: (message: string) => void }} reporter
 * @returns {{ render: () => Promise<void> }}
 */
export function createStreakUI(doc, streak, reporter) {
  function _span(className, text) {
    const node = doc.createElement('span');
    node.className = className;
    node.textContent = text;
    return node;
  }

  async function render() {
    let result;
    try {
      result = await streak.compute();
    } catch (err) {
      console.error('[streak]', err);
      reporter.db('❌ Streak load failed');
      result = _zeroState();
    }

    for (const { id, label, value, sub, good } of _buildTiles(result ?? _zeroState())) {
      const el = doc.getElementById(id);
      if (!el) continue;
      el.replaceChildren(
        _span('stat-tile__label', label),
        _span('stat-tile__value', value),
        _span(good ? 'stat-tile__sub stat-tile__sub--good' : 'stat-tile__sub', sub),
      );
    }
  }

  return { render };
}
