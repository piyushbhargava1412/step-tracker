/**
 * Challenge UI — render layer.
 * Sole DOM writer for the Group Challenge Tracker widget.
 *
 * Factory: createChallengeUI(doc, challenge, db, reporter, { share }) → { render(): Promise<void> }
 *
 * Renders two things:
 *   - #today-challenge: a summary card on the Today screen (name, "Day N of M ·
 *     avg X / day", a progress bar) that opens the Group challenge screen.
 *   - #challenge-detail: the Group challenge screen's card —
 *       - Header: title + date-range subtitle, an Edit (pencil) icon button
 *       - Four metric tiles: Latest Day / Cumulative / Day Progress / Avg. Pace
 *       - The update text that Copy / Share send, then the Copy and Share buttons
 *       - A collapsible date-config section driven by the Edit button
 * The date config is visible by default when no challenge is configured and
 * hidden when one exists; the Edit button toggles it. `share` (optional) sends
 * the update text to the platform share sheet; without it only Copy shows.
 *
 * Design patterns:
 * - Factory-with-DI (no direct document/Dexie imports)
 * - Idempotent render: removes existing #challenge-card before inserting
 * - Fail-open guard when neither mount exists
 * - createElement / textContent / appendChild only (no innerHTML)
 * - AbortController-scoped delegated listener per render (one per render, stale aborted)
 * - try/catch around all async data operations → reporter.db('❌ …') + zero-state card
 */

import { _localDate } from './date-utils.js';
import { computeChallengeMetrics, formatChallengeUpdate } from './challenge.js';
import { createIcon } from './icons.js';

const DEFAULT_NAME = 'Group challenge';

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

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
 * Formats a YYYY-MM-DD date as "Aug 01" or "Oct 01, 2026".
 * @param {string} ymd
 * @param {boolean} withYear
 * @returns {string}
 */
function _fmtDay(ymd, withYear) {
  const [y, m, d] = ymd.split('-').map(Number);
  const mon = MONTH_ABBR[m - 1];
  const dd = String(d).padStart(2, '0');
  return withYear ? `${mon} ${dd}, ${y}` : `${mon} ${dd}`;
}

/**
 * Formats a challenge date range as "Aug 01 — Aug 31, 2026".
 * Falls back to "Not configured" for empty dates.
 * @param {string|null|undefined} start
 * @param {string|null|undefined} end
 * @returns {string}
 */
function _formatRange(start, end) {
  if (!start || !end) return 'Not configured';
  return `${_fmtDay(start, false)} — ${_fmtDay(end, true)}`;
}

/**
 * Zero-value metrics used when no challenge is configured.
 * @returns {object}
 */
function _zeroMetrics() {
  return {
    latestDaySteps: 0,
    cumulativeTotal: 0,
    elapsedDays: 0,
    totalDays: 0,
    avgPace: 0,
    completed: false,
  };
}

/**
 * Factory: Challenge UI renderer.
 *
 * @param {Document} doc
 * @param {{ getActiveChallenge: Function, setActiveChallenge: Function }} challenge
 * @param {object} db — injected Dexie db handle
 * @param {{ db: Function }} reporter
 * @param {{ share?: (text: string) => Promise<void> }} [options]
 * @returns {{ render: Function }}
 */
export function createChallengeUI(doc, challenge, db, reporter, { share = null } = {}) {
  // AbortController for the current render's delegated listener.
  let controller = null;

  /**
   * Build a metric tile used in the mockup grid.
   * @param {string} metricKey
   * @param {string} label
   * @param {string} value
   * @param {string} sub
   * @param {number} [progressPct] - 0-100 fill width for the Day Progress tile
   * @returns {HTMLElement}
   */
  function _buildMetricTile(metricKey, label, value, sub, progressPct = null) {
    const tile = doc.createElement('div');
    tile.className = 'challenge-metric';
    tile.dataset.metric = metricKey;

    const labelEl = doc.createElement('span');
    labelEl.className = 'challenge-metric-label';
    labelEl.textContent = label;

    const valueEl = doc.createElement('span');
    valueEl.className = 'challenge-metric-value';
    valueEl.textContent = value;

    tile.appendChild(labelEl);
    tile.appendChild(valueEl);

    if (progressPct !== null) {
      const track = doc.createElement('div');
      track.className = 'challenge-progress-track';
      const fill = doc.createElement('div');
      fill.className = 'challenge-progress-fill';
      fill.style.width = `${progressPct}%`;
      track.appendChild(fill);
      tile.appendChild(track);
    }

    const subEl = doc.createElement('span');
    subEl.className = 'challenge-metric-sub';
    subEl.textContent = sub;
    tile.appendChild(subEl);

    return tile;
  }

  /**
   * Build the collapsible start/end date config section.
   * Highlighted (visible) by default when no challenge exists; hidden by the
   * card builder once a challenge is configured.
   *
   * @param {object|null} challengeData
   * @returns {HTMLElement}
   */
  function _buildConfigSection(challengeData) {
    const config = doc.createElement('div');
    config.className = 'challenge-config';
    config.id = 'challenge-config';
    config.dataset.editorOnly = ''; // ST-023: hidden in the read-only web viewer

    // Name input row
    const nameLabel = doc.createElement('label');
    const nameLabelText = doc.createElement('span');
    nameLabelText.textContent = 'Challenge name (optional)';
    const nameInput = doc.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Step Challenge';
    nameInput.dataset.field = 'challenge-name';
    if (challengeData && challengeData.name) {
      nameInput.value = challengeData.name;
    }
    nameLabel.appendChild(nameLabelText);
    nameLabel.appendChild(nameInput);
    config.appendChild(nameLabel);

    // Start date picker
    const startLabel = doc.createElement('label');
    const startLabelText = doc.createElement('span');
    startLabelText.textContent = 'Start date';
    const startInput = doc.createElement('input');
    startInput.type = 'date';
    startInput.dataset.field = 'start-date';
    startInput.value = challengeData ? challengeData.start_date : _firstOfMonth();
    startLabel.appendChild(startLabelText);
    startLabel.appendChild(startInput);
    config.appendChild(startLabel);

    // End date picker
    const endLabel = doc.createElement('label');
    const endLabelText = doc.createElement('span');
    endLabelText.textContent = 'End date';
    const endInput = doc.createElement('input');
    endInput.type = 'date';
    endInput.dataset.field = 'end-date';
    endInput.value = challengeData ? challengeData.end_date : _lastOfMonth();
    endLabel.appendChild(endLabelText);
    endLabel.appendChild(endInput);
    config.appendChild(endLabel);

    // Save button
    const saveBtn = doc.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary';
    saveBtn.dataset.action = 'save-challenge';
    saveBtn.textContent = 'Save challenge';
    config.appendChild(saveBtn);

    return config;
  }

  /**
   * Build the mockup metric card.
   *
   * @param {object|null} challengeData
   * @param {object} metrics - result of computeChallengeMetrics (or zero-metrics)
   * @param {string} rangeText - formatted date range subtitle
   * @param {boolean} configVisible - whether the date config starts open
   * @returns {{ card: HTMLElement, name: string|null }}
   */
  function _buildCard(challengeData, metrics, rangeText, configVisible) {
    const { latestDaySteps, cumulativeTotal, elapsedDays, totalDays, avgPace, completed } = metrics;
    const fmt = n => Number(n).toLocaleString('en-US');

    const name =
      challengeData && challengeData.name && challengeData.name.trim()
        ? challengeData.name
        : DEFAULT_NAME;

    const card = doc.createElement('div');
    card.className = 'card challenge-card';
    card.id = 'challenge-card';

    // Header: heading + actions
    const header = doc.createElement('div');
    header.className = 'challenge-header';

    const heading = doc.createElement('div');
    heading.className = 'challenge-heading';

    const title = doc.createElement('h2');
    title.className = 'challenge-title';
    title.textContent = name;

    const range = doc.createElement('p');
    range.className = 'challenge-range';
    range.textContent = rangeText;

    heading.appendChild(title);
    heading.appendChild(range);

    const actions = doc.createElement('div');
    actions.className = 'challenge-actions';

    const edit = doc.createElement('button');
    edit.type = 'button';
    edit.className = 'icon-btn challenge-icon-btn';
    edit.dataset.action = 'toggle-challenge-config';
    edit.dataset.editorOnly = '';
    edit.setAttribute('aria-label', 'Edit challenge');
    edit.appendChild(createIcon(doc, 'pencil', { size: 20 }));
    actions.appendChild(edit);

    header.appendChild(heading);
    header.appendChild(actions);
    card.appendChild(header);

    // "Challenge Finished" badge when completed
    if (completed) {
      const badge = doc.createElement('span');
      badge.className = 'challenge-finished-badge';
      badge.textContent = 'Challenge finished';
      card.appendChild(badge);
    }

    // Four metric tiles (mockup grid)
    const metricsGrid = doc.createElement('div');
    metricsGrid.className = 'challenge-metrics';

    const dayPct = totalDays === 0 ? 0 : Math.min(100, Math.round((elapsedDays / totalDays) * 100));

    metricsGrid.appendChild(
      _buildMetricTile('latest', 'Latest Day', fmt(latestDaySteps), 'Steps')
    );
    metricsGrid.appendChild(
      _buildMetricTile('cumulative', 'Cumulative', fmt(cumulativeTotal), 'Total Steps')
    );
    metricsGrid.appendChild(
      _buildMetricTile(
        'day-progress',
        'Day Progress',
        `Day ${elapsedDays} of ${totalDays}`,
        'Days',
        dayPct
      )
    );
    metricsGrid.appendChild(
      _buildMetricTile('pace', 'Avg. Pace', fmt(Math.round(avgPace)), 'Steps/Day')
    );

    card.appendChild(metricsGrid);

    // The update Copy / Share send, then the two actions
    const preview = doc.createElement('pre');
    preview.className = 'challenge-preview';
    preview.textContent = formatChallengeUpdate(metrics, challengeData ? challengeData.name : null);
    card.appendChild(preview);

    const shareRow = doc.createElement('div');
    shareRow.className = 'challenge-share';
    const copyBtn = doc.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn-secondary challenge-copy-btn';
    copyBtn.dataset.action = 'copy-challenge';
    copyBtn.append(createIcon(doc, 'copy', { size: 18 }), doc.createTextNode('Copy'));
    shareRow.appendChild(copyBtn);
    if (share) {
      const shareBtn = doc.createElement('button');
      shareBtn.type = 'button';
      shareBtn.className = 'btn btn-primary challenge-share-btn';
      shareBtn.dataset.action = 'share-challenge';
      shareBtn.append(createIcon(doc, 'share', { size: 18 }), doc.createTextNode('Share to group'));
      shareRow.appendChild(shareBtn);
    }
    card.appendChild(shareRow);

    // Collapsible date config
    const config = _buildConfigSection(challengeData);
    if (!configVisible) {
      config.hidden = true;
    }
    card.appendChild(config);

    return { card, name: challengeData ? challengeData.name : null };
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
    title.textContent = DEFAULT_NAME;
    header.appendChild(title);
    card.appendChild(header);

    const msg = doc.createElement('p');
    msg.textContent = '⚠️ Challenge data unavailable';
    card.appendChild(msg);

    return card;
  }

  /**
   * Today summary card: name, "Day N of M · avg X / day" and a progress bar;
   * the whole card opens the Group challenge screen.
   *
   * @param {object|null} challengeData
   * @param {object|null} metrics  null when no challenge is configured
   * @returns {HTMLElement}
   */
  function _buildSummary(challengeData, metrics) {
    const fmt = (n) => Number(n).toLocaleString('en-US');
    const summary = doc.createElement('button');
    summary.type = 'button';
    summary.className = 'card challenge-summary';
    summary.dataset.go = 'challenge';
    // ST-023: without a challenge the card only invites setting one up — app only.
    if (!metrics) summary.dataset.editorOnly = '';

    const icon = doc.createElement('span');
    icon.className = 'challenge-summary__icon';
    icon.appendChild(createIcon(doc, 'users', { size: 22 }));

    const text = doc.createElement('span');
    text.className = 'challenge-summary__text';
    const title = doc.createElement('span');
    title.className = 'challenge-summary__title';
    title.textContent = challengeData?.name?.trim() ? challengeData.name : DEFAULT_NAME;
    const sub = doc.createElement('span');
    sub.className = 'challenge-summary__sub';
    sub.textContent = metrics
      ? `Day ${fmt(metrics.elapsedDays)} of ${fmt(metrics.totalDays)} · avg ${fmt(Math.round(metrics.avgPace))} / day`
      : 'Set up a step challenge with friends';
    text.append(title, sub);

    const chevron = createIcon(doc, 'chevronRight', { size: 20 });
    chevron.classList.add('challenge-summary__chevron');
    summary.append(icon, text, chevron);

    if (metrics) {
      const pct = metrics.totalDays === 0 ? 0 : Math.min(100, Math.round((metrics.elapsedDays / metrics.totalDays) * 100));
      const bar = doc.createElement('span');
      bar.className = 'challenge-summary__bar';
      const fill = doc.createElement('span');
      fill.className = 'challenge-summary__bar-fill';
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      summary.appendChild(bar);
    }
    return summary;
  }

  /** Briefly confirm a copy next to the actions. */
  function _flashCopied(card) {
    const badge = doc.createElement('span');
    badge.className = 'copied-badge';
    badge.textContent = 'Copied to clipboard';
    card.appendChild(badge);
    setTimeout(() => badge.remove(), 2000);
  }

  /**
   * Render (or re-render) the challenge screen card and the Today summary.
   * Never throws or rejects — fail-open.
   *
   * @returns {Promise<void>}
   */
  async function render() {
    const detail = doc.getElementById('challenge-detail') || doc.getElementById('tab-challenge');
    const todayMount = doc.getElementById('today-challenge');
    if (!detail && !todayMount) {
      console.warn('[challenge]', 'Missing #challenge-detail and #today-challenge — skipping render');
      return;
    }

    // Abort the prior render's controller; create a fresh one for this render.
    if (controller) {
      controller.abort();
    }
    controller = new (doc.defaultView?.AbortController ?? AbortController)();
    const { signal } = controller;

    // Idempotent: remove stale card before inserting a fresh one.
    doc.getElementById('challenge-card')?.remove();

    let card;
    let summary = null;
    // Captured for the delegated Copy / Share handlers
    let currentMetrics = null;
    let currentName = null;

    try {
      const activeChallenge = await challenge.getActiveChallenge();

      if (!activeChallenge) {
        // No challenge configured → zero metrics, config open
        card = _buildCard(null, _zeroMetrics(), 'Not configured', true).card;
        summary = _buildSummary(null, null);
        currentMetrics = _zeroMetrics();
        currentName = null;
      } else {
        const records = await db.daily_records
          .where('date')
          .between(activeChallenge.start_date, activeChallenge.end_date, true, true)
          .toArray();
        const metrics = computeChallengeMetrics(activeChallenge, records);
        const result = _buildCard(
          activeChallenge,
          metrics,
          _formatRange(activeChallenge.start_date, activeChallenge.end_date),
          false
        );
        card = result.card;
        summary = _buildSummary(activeChallenge, metrics);
        currentMetrics = metrics;
        currentName = result.name;
      }
    } catch (err) {
      console.error('[challenge]', err);
      reporter.db('❌ Challenge data load failed');
      card = _buildZeroStateCard();
      summary = _buildSummary(null, null);
    }

    if (detail) detail.appendChild(card);
    if (todayMount) todayMount.replaceChildren(summary);

    // ONE delegated click listener, scoped to this render via AbortController.
    card.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;

      if (action === 'toggle-challenge-config') {
        const config = card.querySelector('.challenge-config');
        if (config) {
          config.hidden = !config.hidden;
        }
        return;
      }

      if (action === 'save-challenge') {
        const nameVal = card.querySelector('[data-field="challenge-name"]')?.value ?? '';
        const startVal = card.querySelector('[data-field="start-date"]')?.value ?? '';
        const endVal = card.querySelector('[data-field="end-date"]')?.value ?? '';
        try {
          await challenge.setActiveChallenge({ name: nameVal, start_date: startVal, end_date: endVal });
          await render();
        } catch (err) {
          console.error('[challenge]', err);
          reporter.db('❌ Failed to save challenge: ' + err.message);
        }
      }

      if (action === 'copy-challenge') {
        if (!currentMetrics) return;
        const text = formatChallengeUpdate(currentMetrics, currentName);
        try {
          await navigator.clipboard.writeText(text);
          _flashCopied(card);
        } catch (err) {
          console.error('[challenge]', err);
          reporter.db('⚠️ Copy to clipboard failed');
        }
      }

      if (action === 'share-challenge') {
        if (!currentMetrics || !share) return;
        try {
          await share(formatChallengeUpdate(currentMetrics, currentName));
        } catch (err) {
          console.error('[challenge]', err);
          reporter.db('⚠️ Could not share the update');
        }
      }
    }, { signal });
  }

  return { render };
}