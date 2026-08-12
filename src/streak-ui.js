/**
 * Streak render layer.
 * Injects #lifetime-banner and #streak-card into #tab-dashboard.
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

import { TIER_STEP_THRESHOLDS } from './streak.js';
import { DEFAULT_STEP_GOAL } from './goal.js';

/**
 * The three tolerance metrics, in render order (SF-7). Each entry pairs the
 * user-facing label with the `result.tolerance` key that supplies its day count.
 */
const TOLERANCE_METRICS = [
  { key: 'actual', label: 'Actual Streak (100%)' },
  { key: 'allowance95', label: '95% Tolerance' },
  { key: 'allowance90', label: '90% Tolerance' },
];

const HOF_EMPTY_TEXT = 'No qualifying streak periods yet';

/** Zero-state result used when streak.compute() rejects. */
function _zeroState() {
  return {
    tolerance: { actual: 0, allowance95: 0, allowance90: 0 },
    tiers: TIER_STEP_THRESHOLDS.map((t) => ({ threshold: t, active: 0, best: 0 })),
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
 * Build the lifetime banner element (SF-4d).
 *
 * @param {Document} doc
 * @param {{ metDays: number, totalDays: number, pct: number }} lifetime
 * @returns {HTMLElement}
 */
function _buildBanner(doc, lifetime) {
  const { metDays, totalDays, pct } = lifetime;

  const banner = doc.createElement('div');
  banner.id = 'lifetime-banner';

  // SF-4d: "${metDays} / ${totalDays} Days (${pct.toFixed(1)}% Lifetime)"
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
 * Build the 3-metric tolerance block — 100% / 95% / 90% (SF-7).
 *
 * The Actual (100%) value doubles as the card's headline number, so it also
 * carries `.streak-number`; the other two are plain values.
 *
 * @param {Document} doc
 * @param {{ actual: number, allowance95: number, allowance90: number }} tolerance
 * @returns {HTMLElement}
 */
function _buildToleranceMetrics(doc, tolerance) {
  const container = doc.createElement('div');
  container.className = 'tolerance-metrics';

  TOLERANCE_METRICS.forEach(({ key, label }, index) => {
    const metric = doc.createElement('div');
    metric.className = 'tolerance-metric';

    const valueClass = index === 0 ? 'tolerance-value streak-number' : 'tolerance-value';
    metric.appendChild(_el(doc, 'span', valueClass, String(tolerance[key])));
    metric.appendChild(_el(doc, 'span', 'tolerance-label', label));

    container.appendChild(metric);
  });

  return container;
}

/**
 * Build the tier chip row (SF-3, SF-4b, SF-8).
 *
 * @param {Document} doc
 * @param {Array<{ threshold: number, active: number, best: number }>} tiers
 * @param {number} activeStepGoal
 * @returns {HTMLElement}
 */
function _buildTierBadges(doc, tiers, activeStepGoal) {
  const container = doc.createElement('div');
  container.className = 'tier-badges';

  for (const tier of tiers) {
    // SF-4b / SF-8: verbatim mockup format ">Nk: Nd (best Nd)"
    const chip = _el(
      doc,
      'span',
      'tier-chip',
      `>${tier.threshold / 1000}k: ${tier.active}d (best ${tier.best}d)`,
    );

    // SF-3 / SF-4b × SF-10: exact match on threshold → add .tier-chip--active
    if (tier.threshold === activeStepGoal) {
      chip.classList.add('tier-chip--active');
    }

    container.appendChild(chip);
  }

  return container;
}

/**
 * Build the Hall of Fame podium block (SF-4c).
 *
 * Strict (100%) runs only — there are no 95%/90% podium variants. An empty or
 * absent list renders `.hof-empty` instead of entries.
 *
 * @param {Document} doc
 * @param {Array<{ startDate: string, endDate: string, days: number }>} hallOfFame
 * @param {number} stepGoal
 * @returns {HTMLElement}
 */
function _buildHallOfFame(doc, hallOfFame, stepGoal) {
  const block = doc.createElement('div');
  block.className = 'hall-of-fame';

  block.appendChild(
    _el(
      doc,
      'div',
      'hof-title',
      `Hall of Fame — best runs at ${stepGoal.toLocaleString('en-US')} steps`,
    ),
  );

  const entries = Array.isArray(hallOfFame) ? hallOfFame : [];
  if (entries.length === 0) {
    block.appendChild(_el(doc, 'div', 'hof-empty', HOF_EMPTY_TEXT));
    return block;
  }

  entries.forEach((period, index) => {
    const entry = doc.createElement('div');
    entry.className = 'hof-entry';

    entry.appendChild(_el(doc, 'span', 'hof-rank', `#${index + 1}`));
    entry.appendChild(_el(doc, 'span', 'hof-days', `${period.days} days`));
    entry.appendChild(
      _el(doc, 'span', 'hof-range', `${period.startDate} → ${period.endDate}`),
    );

    block.appendChild(entry);
  });

  return block;
}

/**
 * Build the streak card element.
 *
 * Order (SF-7 / SF-4c): title, tolerance metrics, goal label, tier chips,
 * Hall of Fame. The Hall of Fame lives inside the card, so the wholesale
 * remove-and-reinject of `#streak-card` already covers its idempotency.
 *
 * @param {Document} doc
 * @param {object} result - full compute() output
 * @returns {HTMLElement}
 */
function _buildCard(doc, result) {
  const { tolerance, tiers, hallOfFame, activeStepGoal } = result;

  const card = doc.createElement('div');
  card.className = 'streak-card';
  card.id = 'streak-card';

  card.appendChild(_el(doc, 'div', 'card-title', 'Step Streak'));
  card.appendChild(_buildToleranceMetrics(doc, tolerance));

  // SF-6: the goal label is the step lens — "Goal: 10,000 steps", never km.
  card.appendChild(
    _el(doc, 'div', 'streak-goal', `Goal: ${activeStepGoal.toLocaleString('en-US')} steps`),
  );

  card.appendChild(_buildTierBadges(doc, tiers, activeStepGoal));
  card.appendChild(_buildHallOfFame(doc, hallOfFame, activeStepGoal));

  return card;
}

/**
 * Factory: Streak render layer.
 *
 * @param {Document} doc          - injected DOM document
 * @param {{ compute: Function }} streak  - streak engine instance
 * @param {{ db: Function }} reporter     - status reporter
 * @returns {{ render: Function }}
 */
export function createStreakUI(doc, streak, reporter) {
  /**
   * Render (or re-render) #lifetime-banner and #streak-card into #tab-dashboard.
   * Never throws or rejects — fail-open.
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

    // SF-4: prepend banner first, card second so order is: banner, card, existing nodes
    // dashboard.prepend(card) then dashboard.prepend(banner) → banner ends up first
    dashboard.prepend(card);
    dashboard.prepend(banner);
  }

  return { render };
}
