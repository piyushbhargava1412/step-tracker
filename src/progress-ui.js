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
import { STEP_GOAL_OPTIONS } from './goal.js';

/**
 * Factory: Today's Progress card renderer.
 *
 * @param {Document} doc          - The DOM document (injected for testability)
 * @param {{ getActiveStepGoal: Function }} goal - Goal Commitment engine instance
 * @param {object} db             - Injected Dexie db handle
 * @param {{ db: Function }} reporter         - Status reporter (ui-status channel)
 * @param {Function} onGoalApplied - Optional callback invoked after successful goal apply (default no-op)
 * @returns {{ render: Function }}
 */
export function createProgressUI(doc, goal, db, reporter, onGoalApplied = () => {}) {
  /**
   * Build the progress card element from progress data.
   * DOM is built with createElement/createTextNode/textContent only.
   *
   * @param {{ steps, target_steps, pct, remaining_steps, goalMet }} progress
   * @returns {HTMLElement}
   */
  function _buildCard(progress) {
    const { steps, target_steps, pct, remaining_steps, goalMet } = progress;

    const displayPct = goalMet ? 100 : pct;

    const card = doc.createElement('div');
    card.className = 'card';
    card.id = 'progress-card';

    // Card title row
    const titleDiv = doc.createElement('div');
    titleDiv.className = 'card-title';

    const titleLabel = doc.createElement('span');
    titleLabel.textContent = "Today's Progress";
    titleDiv.appendChild(titleLabel);

    const pctSpan = doc.createElement('span');
    pctSpan.className = 'progress-pct';
    pctSpan.textContent = `${displayPct}%`;
    titleDiv.appendChild(pctSpan);

    card.appendChild(titleDiv);

    // Metric row
    const metricRow = doc.createElement('div');
    metricRow.className = 'metric-row';

    const metricValue = doc.createElement('div');
    metricValue.className = 'metric-value';
    metricValue.appendChild(
      doc.createTextNode(`${steps.toLocaleString('en-US')} `)
    );

    const metricUnit = doc.createElement('span');
    metricUnit.className = 'metric-unit';
    metricUnit.textContent = `/ ${target_steps.toLocaleString('en-US')} steps`;
    metricValue.appendChild(metricUnit);

    metricRow.appendChild(metricValue);

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
        `⏱️ ${remaining_steps.toLocaleString('en-US')} steps remaining to fulfill daily target`;
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
      const [todayRecord, activeStepGoal] = await Promise.all([
        getTodayRecord(db),
        goal.getActiveStepGoal(),
      ]);
      progress = computeProgress(todayRecord, activeStepGoal);
    } catch (err) {
      console.error('[progress]', err);
      reporter.db('❌ Progress load failed');
      // Zero-state fallback
      progress = computeProgress(null, null);
    }

    // Idempotency: remove stale card and selector
    doc.getElementById('progress-card')?.remove();
    doc.getElementById('goal-selector')?.remove();

    const card = _buildCard(progress);
    dashboard.appendChild(card);

    // The Active Lens selector lives in the menu bar (#active-lens) when the
    // host shell provides that mount; fall back to the dashboard otherwise.
    const selector = _buildSelector(progress);
    const lensMount = doc.getElementById('active-lens');
    const mount = lensMount || dashboard;
    mount.appendChild(selector);
  }

  /**
   * Build the goal selector element (a Step Target <select>) and attach its
   * change listener.
   *
   * @param {{ target_steps: number }} progress - current render's resolved progress state
   * @returns {HTMLElement}
   */
  function _buildSelector(progress) {
    const GOAL_SAVE_ERROR = '⚠️ Failed to save goal — please try again';

    const container = doc.createElement('div');
    container.className = 'goal-selector';
    container.id = 'goal-selector';

    const select = doc.createElement('select');
    select.id = 'goal-select';
    select.className = 'goal-select';

    for (const steps of STEP_GOAL_OPTIONS) {
      const option = doc.createElement('option');
      option.value = String(steps);
      option.textContent = `${steps.toLocaleString('en-US')} steps`;
      select.appendChild(option);
    }

    select.value = String(progress.target_steps);
    container.appendChild(select);

    // Error span
    const errorSpan = doc.createElement('span');
    errorSpan.id = 'goal-error';
    container.appendChild(errorSpan);

    // Listener attached to the freshly-created <select> each render — the
    // stale-container-replaced-on-re-render pattern kills stale listeners.
    select.addEventListener('change', async (e) => {
      try {
        await goal.setActiveStepGoal(Number(e.target.value));
        await render();
        try { onGoalApplied(); } catch (err) { console.error('[progress]', err); }
      } catch (_err) {
        const errEl = doc.getElementById('goal-error');
        if (errEl) errEl.textContent = GOAL_SAVE_ERROR;
      }
    });

    return container;
  }

  return { render };
}
