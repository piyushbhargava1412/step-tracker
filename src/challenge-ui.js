/**
 * Challenge UI — render layer.
 * Sole DOM writer for the Group Challenge Tracker widget.
 *
 * Factory: createChallengeUI(doc, challenge, db, reporter) → { render(): Promise<void> }
 *
 * Design patterns:
 * - Factory-with-DI (no direct document/Dexie imports)
 * - Idempotent render: removes existing #challenge-card before inserting
 * - Fail-open guard on missing #tab-dashboard
 * - createElement / textContent / appendChild only (no innerHTML)
 * - AbortController-scoped delegated listener per render (Task 5 wires the handlers)
 * - try/catch around all async data operations → reporter.db('❌ …') + zero-state card
 */

import { _localDate, _addDaysUtc } from './date-utils.js';
import { computeChallengeMetrics } from './challenge.js';

/**
 * Returns the first day of the current month as a YYYY-MM-DD string.
 * @returns {string}
 */
function _firstOfMonth() {
  const today = _localDate();
  return today.slice(0, 8) + '01';
}

/**
 * Returns the last day of the current month as a YYYY-MM-DD string.
 * @returns {string}
 */
function _lastOfMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  // Day 0 of next month = last day of current month
  const last = new Date(year, month + 1, 0);
  const yy = last.getFullYear();
  const MM = String(last.getMonth() + 1).padStart(2, '0');
  const dd = String(last.getDate()).padStart(2, '0');
  return `${yy}-${MM}-${dd}`;
}

/**
 * Factory: Challenge UI renderer.
 *
 * @param {Document} doc
 * @param {{ getActiveChallenge: Function, setActiveChallenge: Function }} challenge
 * @param {object} db — injected Dexie db handle
 * @param {{ db: Function }} reporter
 * @returns {{ render: Function }}
 */
export function createChallengeUI(doc, challenge, db, reporter) {
  // AbortController for the current render's delegated listener.
  // Stored in closure so Task 5 can access / abort it.
  let controller = null;

  /**
   * Build the "configure" card for when no challenge is set.
   * @returns {HTMLElement}
   */
  function _buildConfigureCard() {
    const card = doc.createElement('div');
    card.className = 'card';
    card.id = 'challenge-card';

    // Header
    const header = doc.createElement('div');
    header.className = 'card-title';
    const title = doc.createElement('span');
    title.textContent = 'Group Challenge';
    header.appendChild(title);
    card.appendChild(header);

    // Name input row
    const nameLabel = doc.createElement('label');
    const nameLabelText = doc.createElement('span');
    nameLabelText.textContent = 'Challenge Name (optional)';
    const nameInput = doc.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Step Challenge';
    nameInput.dataset.field = 'challenge-name';
    nameLabel.appendChild(nameLabelText);
    nameLabel.appendChild(nameInput);
    card.appendChild(nameLabel);

    // Start date picker
    const startLabel = doc.createElement('label');
    const startLabelText = doc.createElement('span');
    startLabelText.textContent = 'Start Date';
    const startInput = doc.createElement('input');
    startInput.type = 'date';
    startInput.dataset.field = 'start-date';
    startInput.value = _firstOfMonth();
    startLabel.appendChild(startLabelText);
    startLabel.appendChild(startInput);
    card.appendChild(startLabel);

    // End date picker
    const endLabel = doc.createElement('label');
    const endLabelText = doc.createElement('span');
    endLabelText.textContent = 'End Date';
    const endInput = doc.createElement('input');
    endInput.type = 'date';
    endInput.dataset.field = 'end-date';
    endInput.value = _lastOfMonth();
    endLabel.appendChild(endLabelText);
    endLabel.appendChild(endInput);
    card.appendChild(endLabel);

    // Save button
    const saveBtn = doc.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary';
    saveBtn.dataset.action = 'save-challenge';
    saveBtn.textContent = 'Save Challenge';
    card.appendChild(saveBtn);

    return card;
  }

  /**
   * Build the metric view card for when a challenge is active/completed.
   * @param {object} challengeData
   * @param {Array} records
   * @returns {HTMLElement}
   */
  function _buildMetricCard(challengeData, records) {
    const metrics = computeChallengeMetrics(challengeData, records);
    const { yesterdaySteps, cumulativeTotal, elapsedDays, totalDays, avgPace, completed } = metrics;
    const fmt = n => Number(n).toLocaleString('en-US');

    const card = doc.createElement('div');
    card.className = 'card';
    card.id = 'challenge-card';

    // Header
    const header = doc.createElement('div');
    header.className = 'card-title';
    const title = doc.createElement('span');
    const displayName = (challengeData.name && challengeData.name.trim())
      ? challengeData.name
      : 'Step Challenge';
    title.textContent = displayName;
    header.appendChild(title);

    // "Challenge Finished" badge when completed
    if (completed) {
      const badge = doc.createElement('span');
      badge.className = 'challenge-finished-badge';
      badge.textContent = '🏁 Challenge Finished';
      header.appendChild(badge);
    }

    card.appendChild(header);

    // Four metric rows
    const metricDefs = [
      { label: "Yesterday's Steps", value: fmt(yesterdaySteps) },
      { label: 'Cumulative Total', value: `${fmt(cumulativeTotal)} steps` },
      { label: 'Day Progress', value: `Day ${elapsedDays} of ${totalDays}` },
      { label: 'Average Pace', value: `${fmt(Math.round(avgPace))} steps/day` },
    ];

    for (const def of metricDefs) {
      const row = doc.createElement('div');
      row.className = 'metric-row';

      const labelSpan = doc.createElement('span');
      labelSpan.className = 'metric-label';
      labelSpan.textContent = def.label;

      const valueSpan = doc.createElement('span');
      valueSpan.className = 'metric-value';
      valueSpan.textContent = def.value;

      row.appendChild(labelSpan);
      row.appendChild(valueSpan);
      card.appendChild(row);
    }

    // Copy button
    const copyBtn = doc.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn-primary';
    copyBtn.dataset.action = 'copy-challenge';
    copyBtn.textContent = '📋 Copy Group Update';
    card.appendChild(copyBtn);

    return card;
  }

  /**
   * Build a zero-state card shown when data loading fails.
   * @returns {HTMLElement}
   */
  function _buildZeroStateCard() {
    const card = doc.createElement('div');
    card.className = 'card';
    card.id = 'challenge-card';

    const header = doc.createElement('div');
    header.className = 'card-title';
    const title = doc.createElement('span');
    title.textContent = 'Group Challenge';
    header.appendChild(title);
    card.appendChild(header);

    const msg = doc.createElement('p');
    msg.textContent = '⚠️ Challenge data unavailable';
    card.appendChild(msg);

    return card;
  }

  /**
   * Render (or re-render) the challenge card into #tab-dashboard.
   * Never throws or rejects — fail-open.
   *
   * @returns {Promise<void>}
   */
  async function render() {
    const dashboard = doc.getElementById('tab-dashboard');
    if (!dashboard) {
      console.warn('[challenge]', 'Missing #tab-dashboard — skipping render');
      return;
    }

    // Abort the prior render's controller; create a fresh one for this render.
    if (controller) {
      controller.abort();
    }
    controller = new AbortController();

    // Idempotent: remove stale card before inserting a fresh one.
    doc.getElementById('challenge-card')?.remove();

    let card;
    try {
      const activeChallenge = await challenge.getActiveChallenge();

      if (!activeChallenge) {
        // No challenge configured → configure state
        card = _buildConfigureCard();
      } else {
        // Challenge present → query records + metric state
        const records = await db.daily_records
          .where('date')
          .between(activeChallenge.start_date, activeChallenge.end_date, true, true)
          .toArray();
        card = _buildMetricCard(activeChallenge, records);
      }
    } catch (err) {
      console.error('[challenge]', err);
      reporter.db('❌ Challenge data load failed');
      card = _buildZeroStateCard();
    }

    dashboard.appendChild(card);

    // Task 5 will attach the delegated click listener here using controller.signal.
    // The AbortController is stored in the closure for Task 5's use.
  }

  return { render };
}
