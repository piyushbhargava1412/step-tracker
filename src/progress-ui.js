/**
 * Thin render layer for the Today's Progress card.
 * Renders the card anatomy into #tab-dashboard in one of two states:
 *   - In-Progress (pct < 100): shows .remaining-hint
 *   - Goal Met (pct >= 100): shows .goal-met-badge, .progress-fill--full
 *
 * Idempotent: removes any prior #progress-card before injecting a fresh one.
 * Fail-open: render() never throws or rejects; failures log + render zero-state.
 *
 * Dependencies are injected — no direct document/Dexie imports.
 */

import { getTodayRecord, computeProgress } from './progress.js';

/**
 * Factory: Today's Progress card renderer.
 *
 * @param {Document} doc          - The DOM document (injected for testability)
 * @param {{ getActiveGoal: Function }} goal  - Goal Commitment engine instance
 * @param {object} db             - Injected Dexie db handle
 * @param {{ db: Function }} reporter         - Status reporter (ui-status channel)
 * @returns {{ render: Function }}
 */
export function createProgressUI(doc, goal, db, reporter) {
  /**
   * Build the progress card HTML element from progress data.
   *
   * @param {{ steps, distance_km, target_steps, target_km, pct,
   *           remaining_steps, remaining_m, remaining_km, goalMet }} progress
   * @returns {HTMLElement}
   */
  function _buildCard(progress) {
    const {
      steps,
      distance_km,
      target_steps,
      target_km,
      pct,
      remaining_steps,
      remaining_m,
      remaining_km,
      goalMet,
    } = progress;

    const displayPct = goalMet ? 100 : pct;

    // Distance for remaining-hint (SF-5)
    const distanceStr = remaining_km < 1.0
      ? `${remaining_m} meters`
      : `${remaining_km.toFixed(2)} km`;

    const card = doc.createElement('div');
    card.className = 'card';
    card.id = 'progress-card';

    // Card title row
    const titleDiv = doc.createElement('div');
    titleDiv.className = 'card-title';
    titleDiv.innerHTML =
      `<span>Today's Progress</span>` +
      `<span class="progress-pct">${displayPct}%</span>`;
    card.appendChild(titleDiv);

    // Metric row
    const metricRow = doc.createElement('div');
    metricRow.className = 'metric-row';

    const metricValue = doc.createElement('div');
    metricValue.className = 'metric-value';
    metricValue.innerHTML =
      `${steps.toLocaleString('en-US')} ` +
      `<span class="metric-unit">/ ${target_steps.toLocaleString('en-US')} steps</span>`;
    metricRow.appendChild(metricValue);

    const metricSub = doc.createElement('div');
    metricSub.className = 'metric-sub';
    metricSub.textContent =
      `${distance_km.toFixed(2)} / ${target_km.toFixed(2)} km`;
    metricRow.appendChild(metricSub);

    card.appendChild(metricRow);

    // Progress track + fill
    const track = doc.createElement('div');
    track.className = 'progress-track';

    const fill = doc.createElement('div');
    fill.className = goalMet ? 'progress-fill progress-fill--full' : 'progress-fill';
    fill.setAttribute('role', 'progressbar');
    fill.setAttribute('aria-valuenow', String(displayPct));
    fill.setAttribute('aria-valuemin', '0');
    fill.setAttribute('aria-valuemax', '100');
    if (!goalMet) {
      fill.style.width = `${displayPct}%`;
    }
    track.appendChild(fill);
    card.appendChild(track);

    if (goalMet) {
      // Goal Met badge
      const badge = doc.createElement('div');
      badge.className = 'goal-met-badge';
      badge.textContent = '✅ Daily Commitment Met';
      card.appendChild(badge);
    } else {
      // Remaining hint
      const hint = doc.createElement('div');
      hint.className = 'remaining-hint';
      hint.textContent =
        `⏱️ ${remaining_steps.toLocaleString('en-US')} steps remaining to fulfill daily target (~${distanceStr})`;
      card.appendChild(hint);
    }

    return card;
  }

  /**
   * Render (or re-render) the Today's Progress card into #tab-dashboard.
   * Never throws or rejects — fail-open.
   *
   * @returns {Promise<void>}
   */
  async function render() {
    const dashboard = doc.getElementById('tab-dashboard');
    if (!dashboard) {
      console.warn('[progress]', 'Missing #tab-dashboard — skipping render');
      return;
    }

    let progress;
    try {
      const [todayRecord, activeGoal] = await Promise.all([
        getTodayRecord(db),
        goal.getActiveGoal(),
      ]);
      progress = computeProgress(todayRecord, activeGoal);
    } catch (err) {
      console.error('[progress]', err);
      reporter.db('❌ Progress load failed');
      // Zero-state fallback
      progress = computeProgress(null, null);
    }

    // Idempotency: remove stale card
    doc.getElementById('progress-card')?.remove();

    const card = _buildCard(progress);
    dashboard.appendChild(card);
  }

  return { render };
}
