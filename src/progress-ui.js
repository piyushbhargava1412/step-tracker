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
import { GOAL_PRESETS_KM } from './goal.js';

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

    const selector = _buildSelector();
    dashboard.appendChild(selector);
  }

  /**
   * Build the goal selector element and attach delegated listeners.
   * @returns {HTMLElement}
   */
  function _buildSelector() {
    const ERROR_MSG = '⚠️ Enter a distance greater than 0';
    const GOAL_SAVE_ERROR = '⚠️ Failed to save goal — please try again';

    const container = doc.createElement('div');
    container.className = 'goal-selector';
    container.id = 'goal-selector';

    // Preset buttons
    const presets = GOAL_PRESETS_KM;
    for (const km of presets) {
      const btn = doc.createElement('button');
      btn.className = 'goal-preset';
      btn.dataset.goalPreset = String(km);
      btn.textContent = `${km} km`;
      container.appendChild(btn);
    }

    // Custom input
    const input = doc.createElement('input');
    input.className = 'goal-input';
    input.id = 'goal-input';
    input.type = 'number';
    input.placeholder = 'Custom km';
    container.appendChild(input);

    // Apply button
    const applyBtn = doc.createElement('button');
    applyBtn.className = 'goal-apply';
    applyBtn.dataset.goalApply = '';
    applyBtn.textContent = 'Apply';
    container.appendChild(applyBtn);

    // Error span
    const errorSpan = doc.createElement('span');
    errorSpan.id = 'goal-error';
    container.appendChild(errorSpan);

    // Delegated click listener on the container (kills stale listeners when container replaced)
    container.addEventListener('click', async (e) => {
      const preset = e.target.dataset.goalPreset;
      if (preset != null) {
        await _applyPreset(Number(preset));
        return;
      }
      if ('goalApply' in e.target.dataset) {
        const v = Number(input.value);
        const errEl = doc.getElementById('goal-error');
        if (!Number.isFinite(v) || v <= 0) {
          if (errEl) errEl.textContent = ERROR_MSG;
          return;
        }
        if (errEl) errEl.textContent = '';
        await _applyCustom(v);
      }
    });

    // Shared goal-apply logic for both preset and custom paths.
    async function _applyPreset(km) {
      try {
        await goal.setActiveGoal(km);
        await render();
        try { onGoalApplied(); } catch (err) { console.error('[progress]', err); }
      } catch (_err) {
        const errEl = doc.getElementById('goal-error');
        if (errEl) errEl.textContent = GOAL_SAVE_ERROR;
      }
    }

    async function _applyCustom(km) {
      try {
        await goal.setActiveGoal(km);
        await render();
        try { onGoalApplied(); } catch (err) { console.error('[progress]', err); }
      } catch (_err) {
        const errEl = doc.getElementById('goal-error');
        if (errEl) errEl.textContent = GOAL_SAVE_ERROR;
      }
    }

    return container;
  }

  return { render };
}
