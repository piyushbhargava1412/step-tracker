/**
 * analytics-ui.js — the Insights screen (#lab-analytics).
 *
 * Pairs with analytics.js (pure engine). A range switch (All time, then each
 * year with data) scopes every section:
 *   Hall of fame · Top days · By weekday · Time of day · Monthly totals
 * "All time" uses the engine's own figures; a year is recomputed from the
 * cached records with computeInsights(), without another database read.
 *
 * Architecture constraints:
 * - No Dexie imports; all data arrives via engine.compute().
 * - Every node built with createElement / textContent (XSS guard).
 * - AbortController per draw — prevents listener accumulation.
 * - replaceChildren() for idempotent re-renders.
 * - Fail-open: engine errors are caught, reporter.db() notified.
 *
 * proofLightbox is optional: proof buttons render only when it is provided
 * AND the record carries screenshot_proof.
 */

import { computeInsights, computeYearlyMonthlyComparison, extractYears } from './analytics.js';
import { _formatSteps } from './month-overview.js';
import { createIcon } from './icons.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOUR_TICKS = ['12a', '6a', '12p', '6p', '11p'];
const HOURLY_EMPTY_MESSAGE = 'Hourly data will appear after your next sync';
const EMPTY_STATE_MESSAGE = 'No step data found. Sync your steps to see analytics here.';
const ALL_TIME = 'all';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

/** 0 → "12 am", 18 → "6 pm". */
function _hourName(h) {
  const suffix = h < 12 ? 'am' : 'pm';
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}

/** "2025-05-05" → "5 May 2025". */
function _readableDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return `${d} ${MONTH_LABELS[m - 1]} ${y}`;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * @param {Document} doc
 * @param {{ compute: Function }} engine - analytics engine (analytics.js factory)
 * @param {{ db: Function }} reporter
 * @param {{ open: Function }|null} [proofLightbox=null]
 * @returns {{ render: Function }}
 */
export function createAnalyticsUI(doc, engine, reporter, proofLightbox = null) {
  let controller = null;
  let range = ALL_TIME;
  let lastResult = null;

  function _el(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function _section(className, title, sub) {
    const section = _el('section', `card insights-section ${className}`);
    section.appendChild(_el('h2', 'section-title', title));
    if (sub) section.appendChild(_el('p', 'section-sub', sub));
    return section;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async function render() {
    const panel = doc.getElementById('lab-analytics');
    if (!panel) {
      console.warn('[analytics-ui]', 'Missing #lab-analytics — skipping render');
      return;
    }

    try {
      lastResult = await engine.compute();
      _draw(panel);
    } catch (err) {
      console.error('[analytics-ui]', err);
      reporter.db('⚠️ Could not render Analytics');
      panel.replaceChildren(_el('p', '', 'Analytics could not be loaded. Please try again.'));
    }
  }

  /** Build the screen from the cached engine result for the current range. */
  function _draw(panel) {
    controller?.abort();
    controller = new (doc.defaultView?.AbortController ?? AbortController)();
    const { signal } = controller;

    const records = lastResult.records ?? [];
    if (!records.length) {
      panel.replaceChildren(_el('p', '', EMPTY_STATE_MESSAGE));
      return;
    }

    const years = lastResult.years ?? extractYears(records);
    if (range !== ALL_TIME && !years.includes(range)) range = ALL_TIME;
    const insights = range === ALL_TIME
      ? lastResult
      : computeInsights(records, lastResult.activeStepGoal, range);

    panel.replaceChildren(
      _buildRangeSwitch(years, panel, signal),
      _buildHallOfFame(insights.lifetimeMetrics),
      _buildTopDays(insights.topRecords ?? [], signal),
      _buildWeekday(insights.dayOfWeek),
      _buildHourly(insights.hourly ?? []),
      _buildMonthly(records, years, signal),
    );
  }

  // ── Section builders ───────────────────────────────────────────────────────

  function _buildRangeSwitch(years, panel, signal) {
    const bar = _el('div', 'segmented segmented--scroll insights-range');
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', 'Time range');
    for (const value of [ALL_TIME, ...years]) {
      const btn = _el('button', 'segmented__option', value === ALL_TIME ? 'All time' : String(value));
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.dataset.range = String(value);
      btn.setAttribute('aria-selected', String(value === range));
      bar.appendChild(btn);
    }
    bar.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-range]');
      if (!btn) return;
      range = btn.dataset.range === ALL_TIME ? ALL_TIME : Number(btn.dataset.range);
      _draw(panel);
    }, { signal });
    return bar;
  }

  function _buildHallOfFame(metrics) {
    const section = _section('analytics-hall-of-fame', 'Hall of fame');
    const grid = _el('div', 'hof-grid');
    const tiles = [
      ['Total steps', fmt(metrics.totalSteps)],
      ['Distance', `${fmt(metrics.totalDistanceKm)} km`],
      ['Daily average', fmt(metrics.dailyAverage)],
      ['Longest streak', `${metrics.longestStreak} ${metrics.longestStreak === 1 ? 'day' : 'days'}`],
    ];
    for (const [label, value] of tiles) {
      const tile = _el('div', 'hof-tile');
      tile.append(_el('span', 'hof-tile__label', label), _el('span', 'hof-tile__value', value));
      grid.appendChild(tile);
    }
    section.appendChild(grid);
    return section;
  }

  function _buildTopDays(topRecords, signal) {
    const section = _section('analytics-top5', 'Top days');
    const list = _el('ol', 'rank-list');
    topRecords.forEach((record, index) => {
      const item = _el('li', 'rank-list__item');
      item.appendChild(_el('span', 'rank-list__rank', String(index + 1)));
      item.appendChild(_el('span', 'rank-list__date', _readableDate(record.date)));
      if (proofLightbox && record.screenshot_proof) {
        const btn = _el('button', 'icon-btn icon-btn--small rank-list__proof');
        btn.type = 'button';
        btn.dataset.action = 'open-proof';
        btn.dataset.date = record.date;
        btn.setAttribute('aria-label', `View proof for ${_readableDate(record.date)}`);
        btn.appendChild(createIcon(doc, 'camera', { size: 16 }));
        item.appendChild(btn);
      }
      const figures = _el('span', 'rank-list__figures');
      figures.append(
        _el('span', 'rank-list__steps', fmt(record.effective_steps)),
        _el('span', 'rank-list__km', `${Number(record.effective_distance_km || 0).toFixed(1)} km`),
      );
      item.appendChild(figures);
      list.appendChild(item);
    });
    section.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action="open-proof"]');
      if (!btn || !proofLightbox) return;
      const record = topRecords.find((r) => r.date === btn.dataset.date);
      if (record) proofLightbox.open(record);
    }, { signal });
    section.appendChild(list);
    return section;
  }

  function _buildWeekday(dayOfWeek) {
    const averages = dayOfWeek?.averages ?? new Array(7).fill(0);
    const sub = `${DAY_NAMES[dayOfWeek?.powerDay ?? 0]} is your strongest day · ${DAY_NAMES[dayOfWeek?.lazyDay ?? 0]} your quietest`;
    const section = _section('analytics-weekday', 'By weekday', sub);
    section.appendChild(_buildBarChart(averages, DAY_LABELS, DAY_NAMES, 'average steps', { showValues: true }));
    return section;
  }

  function _buildHourly(hourly) {
    const empty = hourly.length !== 24 || hourly.every((v) => !v);
    if (empty) {
      const section = _section('analytics-hourly', 'Time of day');
      section.appendChild(_el('p', 'section-sub', HOURLY_EMPTY_MESSAGE));
      return section;
    }
    const peakHour = hourly.indexOf(Math.max(...hourly));
    const section = _section('analytics-hourly', 'Time of day', `Most steps land around ${_hourName(peakHour)}`);
    const names = hourly.map((_, h) => _hourName(h));
    section.appendChild(_buildBarChart(hourly, names.map(() => ''), names, 'steps', { showValues: false }));
    const ticks = _el('div', 'chart-ticks');
    ticks.setAttribute('aria-hidden', 'true');
    for (const tick of HOUR_TICKS) ticks.appendChild(_el('span', '', tick));
    section.appendChild(ticks);
    return section;
  }

  function _buildMonthly(records, years, signal) {
    const fixedYear = range === ALL_TIME ? null : range;
    const currentYear = new Date().getFullYear();
    const year = fixedYear ?? (years.includes(currentYear) ? currentYear : (years[0] ?? currentYear));

    const section = _section('analytics-yearly', 'Monthly totals', fixedYear ? String(fixedYear) : undefined);
    section.dataset.role = 'yearly-section';

    const holder = _el('div', 'hbar-list');
    holder.dataset.role = 'monthly-chart';
    holder.replaceChildren(..._buildMonthlyBars(records, year));

    if (!fixedYear) {
      const select = _el('select', 'section-select');
      select.dataset.action = 'change-year';
      select.setAttribute('aria-label', 'Year');
      for (const y of years) {
        const opt = _el('option', '', String(y));
        opt.value = String(y);
        if (y === year) opt.selected = true;
        select.appendChild(opt);
      }
      section.querySelector('.section-title').after(select);
      select.addEventListener('change', () => {
        holder.replaceChildren(..._buildMonthlyBars(records, parseInt(select.value, 10)));
      }, { signal });
    }

    section.appendChild(holder);
    return section;
  }

  function _buildMonthlyBars(records, year) {
    const totals = computeYearlyMonthlyComparison(records, year).map((m) => m.total);
    const peak = Math.max(...totals, 1);
    return totals.map((total, i) => {
      const row = _el('div', 'hbar');
      row.setAttribute('role', 'img');
      row.setAttribute('aria-label', `${MONTH_LABELS[i]} ${year}: ${fmt(total)} steps`);
      const track = _el('span', 'hbar__track');
      const fill = _el('span', total === peak && total > 0 ? 'hbar__fill hbar__fill--peak' : 'hbar__fill');
      fill.style.width = `${Math.round((total / peak) * 100)}%`;
      track.appendChild(fill);
      row.append(_el('span', 'hbar__label', MONTH_LABELS[i]), track, _el('span', 'hbar__value', total ? _formatSteps(total) : '—'));
      return row;
    });
  }

  // ── Vertical bar chart ─────────────────────────────────────────────────────

  /**
   * @param {number[]} values
   * @param {string[]} labels      short labels under the bars ('' for none)
   * @param {string[]} names       full names for screen readers
   * @param {string} unit
   * @param {{ showValues: boolean }} options
   */
  function _buildBarChart(values, labels, names, unit, { showValues }) {
    const chart = _el('div', 'bar-chart');
    const peak = Math.max(...values, 1);
    const low = Math.min(...values);
    values.forEach((value, i) => {
      const col = _el('div', 'bar-chart__col');
      if (showValues) col.appendChild(_el('span', 'bar-chart__value', _formatSteps(Math.round(value))));
      let barClass = 'bar-chart__bar';
      if (value === peak && value > 0) barClass += ' bar-chart__bar--peak';
      else if (value === low && showValues) barClass += ' bar-chart__bar--low';
      const bar = _el('div', barClass);
      bar.style.height = `${Math.max(3, Math.round((value / peak) * 100))}%`;
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', `${names[i]}: ${fmt(value)} ${unit}`);
      col.appendChild(bar);
      if (labels[i]) col.appendChild(_el('span', 'bar-chart__label', labels[i]));
      chart.appendChild(col);
    });
    return chart;
  }

  return { render };
}
