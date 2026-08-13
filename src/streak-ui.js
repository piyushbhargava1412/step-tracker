/**
 * Streak render layer.
 * Injects #lifetime-banner and #streak-card into #tab-dashboard. The banner
 * shows lifetime compliance (met / total days + percentage); the card renders
 * the Active Streaks mockup: header + goal badge, the Actual (100%) streak
 * with its bar, the two tolerance allowances, and the Best Runs list.
 *
 * Idempotent: removes stale nodes before injecting fresh ones.
 * Fail-open: render() never throws or rejects.
 *
 * Dependencies are injected — no direct document/Dexie/streak imports beyond
 * constants shared with the computation layer.
 *
 * Sole DOM writer for the streak feature: every node below is built with
 * createElement/textContent — never by assigning raw markup.
 */

import { DEFAULT_STEP_GOAL } from './goal.js';

/**
 * The tolerance allowances, in render order (SF-7). Each entry pairs the
 * user-facing label with the `result.tolerance` key that supplies its day count.
 */
const ALLOWANCE_METRICS = [
  { key: 'allowance95', label: '95% Tolerance' },
  { key: 'allowance90', label: '90% Tolerance' },
];

const RUNS_EMPTY_TEXT = 'No qualifying streak periods yet';

/** Zero-state result used when streak.compute() rejects. */
function _zeroState() {
  return {
    tolerance: { actual: 0, allowance95: 0, allowance90: 0 },
    hallOfFame: [],
    lifetime: { metDays: 0, totalDays: 0, pct: 0 },
    activeStepGoal: DEFAULT_STEP_GOAL,
  };
}

/**
 * Create a `<span>`/`<div>` carrying a class and its text in one step — the
 * whole card is built from these, so it keeps every builder below flat.
 *
 * @param {Document} doc
 * @param {string} tag
 * @param {string} className
 * @param {string} text
 * @returns {HTMLElement}
 */
function _el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

/**
 * Build the lifetime compliance banner element (SF-4d).
 *
 * Format: "${metDays} / ${totalDays} Days (${pct.toFixed(1)}% Lifetime)".
 * Guards against an absent/malformed `lifetime` result so render() stays
 * fail-open.
 *
 * @param {Document} doc
 * @param {{ metDays: number, totalDays: number, pct: number }} lifetime
 * @returns {HTMLElement}
 */
function _buildBanner(doc, lifetime) {
  const { metDays = 0, totalDays = 0, pct = 0 } = lifetime ?? {};

  const banner = doc.createElement('div');
  banner.id = 'lifetime-banner';

  const count = _el(
    doc,
    'span',
    'lifetime-count',
    `${metDays.toLocaleString('en-US')} / ${totalDays.toLocaleString('en-US')}`,
  );
  banner.appendChild(count);
  banner.appendChild(doc.createTextNode(` Days (${pct.toFixed(1)}% Lifetime)`));

  return banner;
}

/**
 * Step goal → mockup goal badge text: "5,000" → "5k Goal", "7,500" → "7.5k Goal".
 *
 * @param {number} stepGoal
 * @returns {string}
 */
function _goalBadgeText(stepGoal) {
  const thousands = stepGoal / 1000;
  const text = Number.isInteger(thousands) ? `${thousands}` : thousands.toFixed(1);
  return `${text}k Goal`;
}

/**
 * Mockup Best Runs range: start/end dates collapse to the year span,
 * e.g. "2021-01-01" + "2025-12-31" → "2021-2025".
 *
 * @param {string} startDate
 * @param {string} endDate
 * @returns {string}
 */
function _formatRunRange(startDate, endDate) {
  const startYear = String(startDate).slice(0, 4);
  const endYear = String(endDate).slice(0, 4);
  return startYear === endYear ? startYear : `${startYear}-${endYear}`;
}

/**
 * Card header: "Active Streaks" title + the step-goal badge.
 *
 * @param {Document} doc
 * @param {number} activeStepGoal
 * @returns {HTMLElement}
 */
function _buildHeader(doc, activeStepGoal) {
  const header = _el(doc, 'div', 'streak-header');
  header.append(
    _el(doc, 'span', 'streak-title', 'Active Streaks'),
    _el(doc, 'span', 'goal-badge', _goalBadgeText(activeStepGoal)),
  );
  return header;
}

/**
 * Actual (100%) streak block: label + headline number + full-width bar.
 *
 * @param {Document} doc
 * @param {number} actual
 * @returns {HTMLElement}
 */
function _buildActual(doc, actual) {
  const block = _el(doc, 'div', 'streak-actual');

  const head = _el(doc, 'div', 'streak-actual-head');
  head.append(
    _el(doc, 'span', 'streak-actual-label', 'Actual (100%)'),
    _el(doc, 'span', 'streak-number', String(actual)),
  );

  const bar = _el(doc, 'div', 'streak-bar');
  const fill = _el(doc, 'div', 'streak-bar-fill');
  fill.style.width = '100%';
  bar.append(fill);

  block.append(head, bar);
  return block;
}

/**
 * The two allowance chips (95% / 90%).
 *
 * @param {Document} doc
 * @param {{ allowance95: number, allowance90: number }} tolerance
 * @returns {HTMLElement}
 */
function _buildAllowances(doc, tolerance) {
  const grid = _el(doc, 'div', 'streak-allowances');

  for (const { key, label } of ALLOWANCE_METRICS) {
    const chip = _el(doc, 'div', 'streak-allowance');
    chip.append(
      _el(doc, 'span', 'streak-allowance-label', label),
      _el(doc, 'span', 'streak-allowance-value', String(tolerance[key] ?? 0)),
    );
    grid.append(chip);
  }

  return grid;
}

/**
 * Best Runs podium list. Strict (100%) runs only. An empty or absent list
 * renders `.streak-runs-empty` instead of entries.
 *
 * @param {Document} doc
 * @param {Array<{ startDate: string, endDate: string, days: number }>} hallOfFame
 * @param {number} activeStepGoal
 * @returns {HTMLElement}
 */
function _buildRuns(doc, hallOfFame, activeStepGoal) {
  const runs = _el(doc, 'div', 'streak-runs');
  const runsList = Array.isArray(hallOfFame) ? hallOfFame : [];

  runs.append(
    _el(
      doc,
      'h3',
      'streak-runs-title',
      `🏆 Best Runs at ${activeStepGoal.toLocaleString('en-US')}`,
    ),
  );

  if (runsList.length === 0) {
    runs.append(_el(doc, 'p', 'streak-runs-empty', RUNS_EMPTY_TEXT));
    return runs;
  }

  runsList.forEach((run, index) => {
    const row = _el(doc, 'div', 'streak-run');
    row.append(
      _el(doc, 'span', 'streak-run-rank', `#${index + 1}`),
      _el(
        doc,
        'span',
        'streak-run-days',
        `${Number(run.days).toLocaleString('en-US')} days`,
      ),
      _el(doc, 'span', 'streak-run-range', _formatRunRange(run.startDate, run.endDate)),
    );
    runs.append(row);
  });

  return runs;
}

/**
 * Assemble the full Active Streaks card.
 *
 * @param {Document} doc
 * @param {{ tolerance: object, hallOfFame: Array, activeStepGoal: number }} result
 * @returns {HTMLElement}
 */
function _buildCard(doc, result) {
  const card = _el(doc, 'div', 'streak-card', '');
  card.id = 'streak-card';

  const { tolerance, hallOfFame, activeStepGoal } = result;

  card.append(
    _buildHeader(doc, activeStepGoal),
    _buildActual(doc, tolerance.actual ?? 0),
    _buildAllowances(doc, tolerance),
    _buildRuns(doc, hallOfFame, activeStepGoal),
  );

  return card;
}

/**
 * Create the streak render controller.
 *
 * @param {Document} doc
 * @param {{ compute: () => Promise<object> }} streak
 * @param {{ db: (message: string) => void }} reporter
 * @returns {{ render: () => Promise<void> }}
 */
export function createStreakUI(doc, streak, reporter) {
  /**
   * Render (or re-render) #streak-card into #tab-dashboard.
   *
   * Idempotent: a stale #lifetime-banner / #streak-card is removed first.
   * Fail-open: a compute() rejection renders the zero-state instead of throwing.
   *
   * @returns {Promise<void>}
   */
  async function render() {
    const dashboard = doc.getElementById('tab-dashboard');
    if (!dashboard) {
      console.warn('[streak]', 'Missing #tab-dashboard — skipping render');
      return;
    }

    let result;
    try {
      result = await streak.compute();
    } catch (err) {
      console.error('[streak]', err);
      reporter.db('❌ Streak load failed');
      result = _zeroState();
    }

    // Idempotency: remove stale nodes before injecting fresh ones
    doc.getElementById('lifetime-banner')?.remove();
    doc.getElementById('streak-card')?.remove();

    const banner = _buildBanner(doc, result.lifetime);
    const card = _buildCard(doc, result);

    // Order: banner first, card second, then pre-existing dashboard content.
    // dashboard.prepend(card) then dashboard.prepend(banner) → banner ends up first
    dashboard.prepend(card);
    dashboard.prepend(banner);
  }

  return { render };
}
