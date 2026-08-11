/**
 * Streak render layer.
 * Injects #lifetime-banner and #streak-card into #tab-dashboard.
 *
 * Idempotent: removes stale nodes before injecting fresh ones.
 * Fail-open: render() never throws or rejects.
 *
 * Dependencies are injected — no direct document/Dexie/streak imports beyond
 * constants shared with the computation layer.
 */

import { TIER_THRESHOLDS } from './streak.js';
import { DEFAULT_GOAL_KM } from './goal.js';

/** Zero-state result used when streak.compute() rejects. */
function _zeroState() {
  return {
    unified: 0,
    tiers: TIER_THRESHOLDS.map((t) => ({ threshold: t, active: 0, best: 0 })),
    hallOfFame: [],
    lifetime: { total10k: 0, totalDays: 0, pct: 0 },
    activeGoalKm: DEFAULT_GOAL_KM,
  };
}

/**
 * Build the lifetime banner element.
 *
 * @param {Document} doc
 * @param {{ total10k: number, totalDays: number, pct: number }} lifetime
 * @returns {HTMLElement}
 */
function _buildBanner(doc, lifetime) {
  const { total10k, totalDays, pct } = lifetime;

  const banner = doc.createElement('div');
  banner.id = 'lifetime-banner';

  // SF-5: exact format — "${total10k.toLocaleString('en-US')} / ${totalDays.toLocaleString('en-US')} Days (${pct.toFixed(1)}% Lifetime)"
  const count = doc.createElement('span');
  count.className = 'lifetime-count';
  count.textContent = `${total10k.toLocaleString('en-US')} / ${totalDays.toLocaleString('en-US')}`;
  banner.appendChild(count);
  banner.appendChild(doc.createTextNode(` Days (${pct.toFixed(1)}% Lifetime)`));

  return banner;
}

/**
 * Build the Unified Active Streak card element.
 *
 * @param {Document} doc
 * @param {object} result - full compute() output
 * @returns {HTMLElement}
 */
function _buildCard(doc, result) {
  const { unified, tiers, activeGoalKm } = result;

  const card = doc.createElement('div');
  card.className = 'streak-card';
  card.id = 'streak-card';

  // Title
  const titleEl = doc.createElement('div');
  titleEl.className = 'card-title';
  titleEl.textContent = 'Unified Active Streak';
  card.appendChild(titleEl);

  // Lock badge (SF-15)
  const lockBadge = doc.createElement('div');
  lockBadge.className = 'lock-badge';
  lockBadge.textContent = '🔒 Effective Date Lock';
  card.appendChild(lockBadge);

  // Streak number + unit row
  const metricRow = doc.createElement('div');
  metricRow.className = 'metric-row';

  const streakNum = doc.createElement('span');
  streakNum.className = 'streak-number';
  streakNum.textContent = String(unified);
  metricRow.appendChild(streakNum);

  const streakUnit = doc.createElement('span');
  streakUnit.className = 'streak-unit';
  streakUnit.textContent = 'Days';
  metricRow.appendChild(streakUnit);

  card.appendChild(metricRow);

  // Goal label (SF-6): "Goal: 5.0 km"
  const goalEl = doc.createElement('div');
  goalEl.className = 'streak-goal';
  goalEl.textContent = `Goal: ${activeGoalKm.toFixed(1)} km`;
  card.appendChild(goalEl);

  // Tier chips (SF-3, SF-8)
  const tiersContainer = doc.createElement('div');
  tiersContainer.className = 'tier-badges';

  for (const tier of tiers) {
    const chip = doc.createElement('span');
    chip.className = 'tier-chip';

    // SF-3: exact match on threshold → add .tier-chip--active
    if (tier.threshold === activeGoalKm) {
      chip.classList.add('tier-chip--active');
    }

    // SF-8 / SF-15: verbatim mockup format ">Nkm: Nd"
    chip.textContent = `>${tier.threshold}km: ${tier.active}d`;
    tiersContainer.appendChild(chip);
  }

  card.appendChild(tiersContainer);

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
