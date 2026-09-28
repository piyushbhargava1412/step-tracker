/**
 * Calendar Week view — render layer (#calendar-week).
 *
 * Week range with previous / next buttons, three summary tiles (total, daily
 * average, goal hits among finished days), a bar chart with the goal line,
 * and the seven days as a list. Today shows as in progress until it hits the goal. Tapping a bar or a row calls onDayClick(day) — the Calendar opens
 * the same day sheet the Month view uses.
 *
 * Idempotent: each render replaces the mount's content and aborts the previous
 * render's listeners. Fail-open: render() never throws or rejects.
 */

import { _addDaysUtc } from './date-utils.js';
import { CLASSIFICATION_MET, CLASSIFICATION_MISSED } from './calendar.js';
import { _formatSteps } from './month-overview.js';
import { createIcon } from './icons.js';

const fmt = (n) => Number(n).toLocaleString('en-US');

/** 'hit' | 'missed' | 'today' | 'none' | 'future' for a classified day. */
function _stateOf(day) {
  if (day.isFuture) return 'future';
  if (day.inProgress) return 'today';
  const state = day.classification?.state;
  if (state >= CLASSIFICATION_MET) return 'hit';
  if (state === CLASSIFICATION_MISSED) return 'missed';
  return 'none';
}

const STATE_WORDS = { hit: 'goal hit', missed: 'missed', today: 'in progress', none: 'no data', future: 'upcoming' };

/**
 * @param {Document} doc
 * @param {{ loadWeek: Function, buildZeroState: Function }} weekEngine
 * @param {{ db: Function }} reporter
 * @param {{ onDayClick?: (day: object) => void }} [options]
 * @returns {{ render: (weekStart?: string) => Promise<void> }}
 */
export function createCalendarWeekUI(doc, weekEngine, reporter, { onDayClick = () => {} } = {}) {
  let selectedStart = null;
  let controller = null;

  function _el(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function _buildNav(week) {
    const nav = _el('div', 'period-nav');
    const prev = _el('button', 'icon-btn');
    prev.type = 'button';
    prev.dataset.weekNav = 'prev';
    prev.setAttribute('aria-label', 'Previous week');
    prev.appendChild(createIcon(doc, 'chevronLeft', { size: 20 }));
    prev.disabled = !week.navBounds?.canGoPrev;

    const next = _el('button', 'icon-btn');
    next.type = 'button';
    next.dataset.weekNav = 'next';
    next.setAttribute('aria-label', 'Next week');
    next.appendChild(createIcon(doc, 'chevronRight', { size: 20 }));
    next.disabled = !week.navBounds?.canGoNext;

    nav.append(prev, _el('span', 'period-nav__label', week.label), next);
    return nav;
  }

  function _buildSummary(week) {
    const { totalSteps, averageDailySteps } = week.aggregates ?? {};
    const { met = 0, finished = 0 } = week.hits ?? {};
    const tiles = [
      ['Total', totalSteps == null ? '—' : fmt(totalSteps)],
      ['Daily avg', averageDailySteps == null ? '—' : fmt(averageDailySteps)],
      ['Goal hit', finished ? `${met} of ${finished}` : '—'],
    ];
    const wrap = _el('div', 'summary-tiles');
    for (const [label, value] of tiles) {
      const tile = _el('div', 'summary-tile');
      tile.append(_el('span', 'summary-tile__label', label), _el('span', 'summary-tile__value', value));
      wrap.appendChild(tile);
    }
    return wrap;
  }

  function _dayAria(day) {
    const steps = day.record && !day.isFuture ? `${fmt(day.record.effective_steps)} steps` : 'no steps';
    return `${day.fullLabel}, ${steps}, ${STATE_WORDS[_stateOf(day)]}`;
  }

  function _buildChart(week, signal) {
    const goal = week.activeStepGoal;
    const peak = Math.max(goal, ...week.days.map((d) => (d.record && !d.isFuture ? d.record.effective_steps || 0 : 0)));
    const scale = peak * 1.1;

    const card = _el('section', 'card week-chart');
    card.setAttribute('aria-label', 'Steps per day');
    const plot = _el('div', 'week-chart__plot');

    const goalLine = _el('span', 'week-chart__goal');
    goalLine.style.bottom = `${((goal / scale) * 100).toFixed(1)}%`;
    goalLine.appendChild(_el('span', 'week-chart__goal-label', `${_formatSteps(goal)} goal`));
    plot.appendChild(goalLine);

    const labels = _el('div', 'week-chart__labels');
    for (const day of week.days) {
      const state = _stateOf(day);
      const col = _el('button', 'week-chart__col');
      col.type = 'button';
      col.dataset.date = day.date;
      col.setAttribute('aria-label', _dayAria(day));
      col.disabled = day.isFuture;
      const steps = day.record && !day.isFuture ? day.record.effective_steps || 0 : 0;
      col.appendChild(_el('span', 'week-chart__value', steps ? _formatSteps(steps) : ''));
      const bar = _el('span', `week-chart__bar week-chart__bar--${state}`);
      bar.style.height = `${((steps / scale) * 100).toFixed(1)}%`;
      col.appendChild(bar);
      col.addEventListener('click', () => onDayClick(day), { signal });
      plot.appendChild(col);

      const label = _el('span', day.isToday ? 'week-chart__label week-chart__label--today' : 'week-chart__label', day.dayLabel);
      label.setAttribute('aria-hidden', 'true');
      labels.appendChild(label);
    }
    card.append(plot, labels);
    return card;
  }

  function _buildList(week, signal) {
    const list = _el('section', 'card day-list');
    list.setAttribute('aria-label', 'Days of the week');
    for (const day of week.days) {
      const state = _stateOf(day);
      const row = _el('button', 'day-row');
      row.type = 'button';
      row.dataset.date = day.date;
      row.disabled = day.isFuture;
      row.setAttribute('aria-label', _dayAria(day));
      row.append(
        _el('span', `day-row__dot day-row__dot--${state}`),
        _el('span', 'day-row__label', day.isToday ? `${day.fullLabel} · today` : day.fullLabel),
        _el('span', 'day-row__steps', day.record && !day.isFuture ? fmt(day.record.effective_steps) : '—'),
      );
      row.addEventListener('click', () => onDayClick(day), { signal });
      list.appendChild(row);
    }
    return list;
  }

  /**
   * Render the given week (default: the one last shown, else the current week).
   * @param {string} [weekStart]  a Monday, YYYY-MM-DD
   */
  async function render(weekStart = selectedStart) {
    const mount = doc.getElementById('calendar-week');
    if (!mount) {
      console.warn('[calendar-week]', 'Missing #calendar-week — skipping render');
      return;
    }

    let week;
    try {
      week = await weekEngine.loadWeek(weekStart || undefined);
    } catch (err) {
      console.error('[calendar-week]', err);
      reporter.db('❌ Week load failed');
      week = weekEngine.buildZeroState(weekStart || undefined);
    }
    selectedStart = week.start;

    controller?.abort();
    controller = new (doc.defaultView?.AbortController ?? AbortController)();
    const { signal } = controller;

    const nav = _buildNav(week);
    nav.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-week-nav]');
      if (!btn || btn.disabled) return;
      render(_addDaysUtc(week.start, btn.dataset.weekNav === 'prev' ? -7 : 7));
    }, { signal });

    const content = [nav, _buildSummary(week)];
    if (week.days.length) content.push(_buildChart(week, signal), _buildList(week, signal));
    mount.replaceChildren(...content);
  }

  return { render };
}
