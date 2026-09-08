/**
 * analytics-ui.js — DOM renderer for the Lab tab analytics sections.
 *
 * Pairs with analytics.js (pure engine). This module owns all DOM writes for
 * the analytics sections in #tab-lab.
 *
 * Architecture constraints:
 * - No Dexie imports; all data arrives via engine.compute().
 * - No innerHTML for user-supplied strings (XSS guard).
 * - AbortController per render() call — prevents listener accumulation.
 * - replaceChildren() for idempotent re-renders.
 * - Fail-open: errors from engine are caught, reporter.db() notified.
 *
 * SF-6: proofLightbox is optional. Proof buttons rendered only when it is
 *       provided AND the record carries screenshot_proof.
 * SF-7: All-zero hourly array → descriptive message, no bar chart.
 * SF-13: render() catch → console.error + reporter.db + error <p>.
 * SF-14: Default year = new Date().getFullYear(); otherwise most-recent.
 */

import { computeYearlyMonthlyComparison } from './analytics.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const SECTION_TAG = 'section';
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => {
  const ampm = h < 12 ? 'am' : 'pm';
  const label = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${label}${ampm}`;
});
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const HOURLY_EMPTY_MESSAGE = 'Hourly data will appear after your next sync';
const EMPTY_STATE_MESSAGE = 'No step data found. Sync your steps to see analytics here.';
const BAR_CHART_CLASS = 'bar-chart';
const BAR_CLASS = 'bar-chart__bar';
const MIN_BAR_SAFE_DENOMINATOR = 1; // avoids /0 when all values are 0

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates the analytics UI renderer.
 *
 * @param {Document} doc - DOM document (injected for testability)
 * @param {{ compute: Function }} engine - analytics engine (analytics.js factory)
 * @param {{ db: Function }} reporter - status reporter
 * @param {{ open: Function }|null} [proofLightbox=null] - optional proof lightbox
 * @returns {{ render: Function }}
 */
export function createAnalyticsUI(doc, engine, reporter, proofLightbox = null) {
  let controller = null;
  let cachedRecords = null; // retained for year-change re-render

  // ── Public API ─────────────────────────────────────────────────────────────

  async function render() {
    const panel = doc.getElementById('lab-analytics');
    if (!panel) {
      console.warn('[analytics-ui]', 'Missing #lab-analytics — skipping render');
      return;
    }

    // Abort previous controller before creating a new one
    if (controller) controller.abort();
    controller = new AbortController();
    const { signal } = controller;

    try {
      const result = await engine.compute();
      cachedRecords = result.records ?? [];

      if (!cachedRecords.length) {
        panel.replaceChildren(_buildEmptyState());
        return;
      }

      const sections = [
        _buildHallOfFame(result.lifetimeMetrics),
        _buildTop5Table(result.topRecords, signal),
        _buildWeekdayHistogram(result.dayOfWeek),
        _buildHourlyChart(result.hourly),
        _buildYearlySection(cachedRecords, signal),
      ];
      panel.replaceChildren(...sections);
    } catch (err) {
      console.error('[analytics-ui]', err);
      reporter.db('⚠️ Could not render Analytics');
      const errP = doc.createElement('p');
      errP.textContent = 'Analytics could not be loaded. Please try again.';
      panel.replaceChildren(errP);
    }
  }

  // ── Section builders ───────────────────────────────────────────────────────

  function _buildEmptyState() {
    const p = doc.createElement('p');
    p.textContent = EMPTY_STATE_MESSAGE;
    return p;
  }

  /**
   * Hall of Fame — four metric tiles in a <dl>.
   */
  function _buildHallOfFame(metrics) {
    const section = doc.createElement(SECTION_TAG);
    section.className = 'analytics-hall-of-fame';

    const h2 = doc.createElement('h2');
    h2.textContent = '🏆 Hall of Fame';
    section.appendChild(h2);

    const grid = doc.createElement('div');
    grid.className = 'hof-grid';
    const tiles = [
      { label: 'Total Steps', value: Math.round(metrics.totalSteps).toLocaleString() },
      { label: 'Distance (km)', value: Math.round(metrics.totalDistanceKm).toLocaleString() },
      { label: 'Daily Average', value: Math.round(metrics.dailyAverage).toLocaleString() },
      { label: 'Longest Streak', value: `${metrics.longestStreak} days` },
    ];

    for (const tile of tiles) {
      const tileEl = doc.createElement('div');
      tileEl.className = 'hof-tile';

      const labelEl = doc.createElement('span');
      labelEl.className = 'hof-tile__label';
      labelEl.textContent = tile.label;

      const valueEl = doc.createElement('span');
      valueEl.className = 'hof-tile__value';
      valueEl.textContent = tile.value;

      tileEl.append(labelEl, valueEl);
      grid.appendChild(tileEl);
    }

    section.appendChild(grid);
    return section;
  }

  /**
   * Top-5 records table.
   */
  function _buildTop5Table(topRecords, signal) {
    const section = doc.createElement(SECTION_TAG);
    section.className = 'analytics-top5';

    const h2 = doc.createElement('h2');
    h2.textContent = '📋 Top Days';
    section.appendChild(h2);

    const table = doc.createElement('table');
    const thead = doc.createElement('thead');
    const headerRow = doc.createElement('tr');
    for (const col of ['Date', 'Steps', 'Distance (km)', 'Proof']) {
      const th = doc.createElement('th');
      th.textContent = col;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = doc.createElement('tbody');
    for (const record of topRecords) {
      const tr = doc.createElement('tr');

      const tdDate = doc.createElement('td');
      tdDate.textContent = record.date;

      const tdSteps = doc.createElement('td');
      tdSteps.textContent = String(record.effective_steps);

      const tdDist = doc.createElement('td');
      tdDist.textContent = Number(record.effective_distance_km).toFixed(2);

      const tdProof = doc.createElement('td');
      if (proofLightbox && record.screenshot_proof) {
        const btn = doc.createElement('button');
        btn.setAttribute('data-action', 'open-proof');
        btn.setAttribute('data-date', record.date);
        btn.textContent = 'View';
        tdProof.appendChild(btn);
      }

      tr.append(tdDate, tdSteps, tdDist, tdProof);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    // Delegated listener for proof buttons
    section.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action="open-proof"]');
      if (!btn || !proofLightbox) return;
      const date = btn.dataset.date;
      const record = topRecords.find(r => r.date === date);
      if (record) proofLightbox.open(record);
    }, { signal });

    section.appendChild(table);
    return section;
  }

  /**
   * Weekday histogram — bar chart for 7 ISO weekdays (Mon–Sun).
   */
  function _buildWeekdayHistogram(dayOfWeek) {
    const section = doc.createElement(SECTION_TAG);
    section.className = 'analytics-weekday';

    const h2 = doc.createElement('h2');
    h2.textContent = '📅 Day-of-Week Distribution';
    section.appendChild(h2);

    const powerLabel = DAY_LABELS[dayOfWeek.powerDay];
    const lazyLabel = DAY_LABELS[dayOfWeek.lazyDay];
    const meta = doc.createElement('p');
    meta.textContent = `Power day: ${powerLabel} · Lazy day: ${lazyLabel}`;
    section.appendChild(meta);

    section.appendChild(_buildBarChart(dayOfWeek.averages, DAY_LABELS, 'avg steps'));
    return section;
  }

  /**
   * 24-hour distribution chart. Shows empty message when all values are zero.
   */
  function _buildHourlyChart(hourly) {
    const section = doc.createElement(SECTION_TAG);
    section.className = 'analytics-hourly';

    const h2 = doc.createElement('h2');
    h2.textContent = '🕐 24-Hour Step Distribution';
    section.appendChild(h2);

    const isAllZero = hourly.every(v => v === 0);
    if (isAllZero) {
      const msg = doc.createElement('p');
      msg.textContent = HOURLY_EMPTY_MESSAGE;
      section.appendChild(msg);
    } else {
      section.appendChild(_buildBarChart(hourly, HOUR_LABELS, 'steps'));
    }

    return section;
  }

  /**
   * Yearly monthly comparison — includes year <select> and monthly bar chart.
   */
  function _buildYearlySection(records, signal) {
    const section = doc.createElement(SECTION_TAG);
    section.className = 'analytics-yearly';
    section.setAttribute('data-role', 'yearly-section');

    const h2 = doc.createElement('h2');
    h2.textContent = '📆 Monthly Breakdown';
    section.appendChild(h2);

    const years = _extractYears(records);
    const currentYear = new Date().getFullYear();
    const defaultYear = years.includes(currentYear) ? currentYear : (years[0] ?? currentYear);

    // Year selector
    const select = doc.createElement('select');
    select.setAttribute('data-action', 'change-year');
    for (const y of years) {
      const opt = doc.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      if (y === defaultYear) opt.selected = true;
      select.appendChild(opt);
    }
    section.appendChild(select);

    // Monthly chart placeholder (replaced on year change)
    const chartHolder = doc.createElement('div');
    chartHolder.setAttribute('data-role', 'monthly-chart');
    chartHolder.appendChild(_buildMonthlyChart(records, defaultYear));
    section.appendChild(chartHolder);

    // Delegated change listener for year selector
    section.addEventListener('change', (event) => {
      const target = event.target.closest('[data-action="change-year"]');
      if (!target) return;
      const selectedYear = parseInt(target.value, 10);
      chartHolder.replaceChildren(_buildMonthlyChart(cachedRecords ?? records, selectedYear));
    }, { signal });

    return section;
  }

  function _buildMonthlyChart(records, year) {
    const months = computeYearlyMonthlyComparison(records, year);
    const totals = months.map(m => m.total);
    return _buildBarChart(totals, MONTH_LABELS, 'steps');
  }

  // ── Generic bar chart builder ──────────────────────────────────────────────

  /**
   * Builds a proportional bar chart.
   *
   * @param {number[]} values
   * @param {string[]} labels
   * @param {string} unit - used in aria-label
   * @returns {HTMLElement}
   */
  function _buildBarChart(values, labels, unit) {
    const MAX_BAR_HEIGHT_PX = 90;
    const chart = doc.createElement('div');
    chart.className = BAR_CHART_CLASS;

    const maxValue = Math.max(...values, MIN_BAR_SAFE_DENOMINATOR);

    for (let i = 0; i < values.length; i++) {
      const col = doc.createElement('div');
      col.className = 'bar-chart__col';

      const bar = doc.createElement('div');
      bar.className = BAR_CLASS;
      const heightPx = Math.max(2, Math.round((values[i] / maxValue) * MAX_BAR_HEIGHT_PX));
      bar.style.height = `${heightPx}px`;
      bar.setAttribute('aria-label', `${labels[i]}: ${values[i]} ${unit}`);
      col.appendChild(bar);

      const labelEl = doc.createElement('span');
      labelEl.className = 'bar-chart__label';
      labelEl.textContent = labels[i];
      col.appendChild(labelEl);

      chart.appendChild(col);
    }

    return chart;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Extracts unique years from records, sorted descending.
   *
   * @param {Array<{ date: string }>} records
   * @returns {number[]}
   */
  function _extractYears(records) {
    const yearSet = new Set();
    for (const r of records) {
      if (typeof r.date === 'string' && r.date.length >= 4) {
        const y = parseInt(r.date.slice(0, 4), 10);
        if (Number.isFinite(y)) yearSet.add(y);
      }
    }
    return [...yearSet].sort((a, b) => b - a);
  }

  return { render };
}
