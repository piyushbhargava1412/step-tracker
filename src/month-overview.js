/**
 * Reusable month overview renderer.
 *
 * Dashboard callers default to the current local month. Calendar callers can
 * inject their selected month and payload into the same card renderer.
 *
 * Idempotent: removes any prior #month-overview-card before injecting a fresh one.
 * Fail-open: render() never throws or rejects; failures log + render zero-state.
 *
 * Dependencies are injected — no direct document/Dexie imports.
 */

import {
  CLASSIFICATION_MISSED,
  CLASSIFICATION_MET,
  CLASSIFICATION_EXCEEDED,
  computeCommitmentHitRate,
} from './calendar.js';

/** Mon-first weekday header labels (matches buildMonthGrid's alignment). */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Compact steps label for a tile: "7.2k" above 1000, raw integer below.
 * @param {number} steps
 * @returns {string}
 */
export function _formatSteps(steps) {
  if (!Number.isFinite(steps)) return '';
  if (steps >= 1000) {
    const thousands = steps / 1000;
    return `${thousands.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(steps);
}

/**
 * Map a day classification state to a heatmap tile modifier class.
 * @param {number} state - one of the CLASSIFICATION_* constants
 * @returns {string}
 */
export function _stateClass(state) {
  switch (state) {
    case CLASSIFICATION_EXCEEDED:
      return 'heatmap-tile--exceeded';
    case CLASSIFICATION_MET:
      return 'heatmap-tile--met';
    case CLASSIFICATION_MISSED:
      return 'heatmap-tile--missed';
    default:
      return 'heatmap-tile--no-data';
  }
}

/**
 * Factory: dashboard current-month overview card.
 *
 * @param {Document} doc           - The DOM document (injected for testability)
 * @param {{ loadMonth: Function, buildZeroState: Function }} calendarEngine - Calendar engine instance
 * @param {{ db: Function }} reporter - Status reporter (ui-status channel)
 * @returns {{ render: Function }}
 */
export function createMonthOverview(doc, calendarEngine, reporter) {
  /**
   * Render a month overview into Dashboard or another injected view.
   *
   * @param {{ slot?: HTMLElement, year?: number, month?: number,
   *           payload?: object, cardId?: string, showHistoryHint?: boolean }} [options]
   * @returns {Promise<void>}
   */
  async function render(options = {}) {
    const slot = options.slot ||
      doc.getElementById('dashboard-month') || doc.getElementById('tab-dashboard');
    const cardId = options.cardId || 'month-overview-card';
    if (!slot) {
      console.warn('[month-overview]', 'Missing overview target — skipping render');
      return;
    }

    const now = new Date();
    const year = options.year ?? now.getFullYear();
    const month = options.month ?? now.getMonth();
    let payload = options.payload;

    if (!payload) {
      try {
        payload = await calendarEngine.loadMonth(year, month);
      } catch (err) {
        console.error('[month-overview]', err);
        reporter.db('❌ Month overview load failed');
        payload = calendarEngine.buildZeroState(year, month);
      }
    }

    slot.querySelector(`#${cardId}`)?.remove();
    slot.prepend(_buildCard(doc, payload, cardId, options.showHistoryHint !== false));
  }

  /**
   * Build the month-overview card element from a calendar payload.
   * @param {Document} doc
   * @param {object} payload - loadMonth/buildZeroState payload
   * @param {string} cardId
   * @param {boolean} showHistoryHint
   * @returns {HTMLElement}
   */
  function _buildCard(doc, payload, cardId, showHistoryHint) {
    const card = doc.createElement('div');
    card.className = 'card';
    card.id = cardId;

    // ── Card title row ─────────────────────────────────────────────────────
    const title = doc.createElement('div');
    title.className = 'card-title';

    const caption = doc.createElement('span');
    const monthName = new Date(payload.year, payload.month, 1).toLocaleDateString('en-US', { month: 'long' });
    caption.textContent = `${monthName} ${payload.year} Overview`;
    title.appendChild(caption);

    const hitRate = doc.createElement('span');
    hitRate.className = 'month-hit-rate';
    const pct = _commitmentHitRate(payload);
    hitRate.textContent = pct != null ? `Hit Rate: ${pct}%` : 'Hit Rate: —';
    title.appendChild(hitRate);

    card.appendChild(title);

    // ── Heatmap grid ───────────────────────────────────────────────────────
    const grid = doc.createElement('div');
    grid.className = 'heatmap-grid';
    grid.id = 'month-heatmap';

    for (const weekday of WEEKDAYS) {
      const cell = doc.createElement('span');
      cell.className = 'heatmap-weekday';
      cell.setAttribute('aria-hidden', 'true');
      cell.textContent = weekday;
      grid.appendChild(cell);
    }

    for (let i = 0; i < (payload.leadingPad ?? 0); i += 1) {
      grid.appendChild(_buildPad(doc));
    }

    for (const day of payload.days ?? []) {
      grid.appendChild(_buildTile(doc, day, payload.today));
    }

    for (let i = 0; i < (payload.trailingPad ?? 0); i += 1) {
      grid.appendChild(_buildPad(doc));
    }

    card.appendChild(grid);

    // ── History hint ───────────────────────────────────────────────────────
    if (showHistoryHint) {
      const hint = doc.createElement('p');
      hint.className = 'month-overview-hint';
      hint.textContent = 'Full month & year history is available in the Calendar tab.';
      card.appendChild(hint);
    }

    return card;
  }

  function _commitmentHitRate(payload) {
    return computeCommitmentHitRate(payload.days, payload.today, payload.activeGoalKm);
  }

  /**
   * Empty grid filler cell for calendar alignment.
   * @param {Document} doc
   * @returns {HTMLElement}
   */
  function _buildPad(doc) {
    const pad = doc.createElement('span');
    pad.className = 'heatmap-tile heatmap-tile--pad';
    pad.setAttribute('aria-hidden', 'true');
    return pad;
  }

  /**
   * Build a single day tile: day number, compact steps label (or "Today"),
   * and an override asterisk when applicable.
   * @param {Document} doc
   * @param {object} day - enriched calendar day from the payload
   * @param {string} today - YYYY-MM-DD
   * @returns {HTMLElement}
   */
  function _buildTile(doc, day, today) {
    const tile = doc.createElement('div');
    tile.className = `heatmap-tile ${_stateClass(day.classification?.state)}`;
    tile.dataset.date = day.date;

    if (day.date === today) tile.classList.add('heatmap-tile--today');
    if (day.isFuture) tile.classList.add('heatmap-tile--future');
    if (day.classification?.isOverridden) tile.classList.add('heatmap-tile--overridden');

    const dayNum = doc.createElement('span');
    dayNum.className = 'heatmap-day';
    dayNum.textContent = String(day.dayOfMonth);
    tile.appendChild(dayNum);

    let label = '';
    if (day.date === today) {
      label = 'Today';
    } else if (!day.isFuture && day.record) {
      label = _formatSteps(day.record.effective_steps);
    }

    if (label !== '') {
      const stepsEl = doc.createElement('span');
      stepsEl.className = 'heatmap-steps';
      stepsEl.textContent = label;
      tile.appendChild(stepsEl);
    }

    if (day.classification?.isOverridden) {
      const badge = doc.createElement('span');
      badge.className = 'heatmap-tile__override';
      badge.setAttribute('aria-label', 'Manually overridden');
      badge.textContent = '*';
      tile.appendChild(badge);
    }

    return tile;
  }

  return { render };
}
