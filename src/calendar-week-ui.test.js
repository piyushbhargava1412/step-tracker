import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCalendarWeekUI } from './calendar-week-ui.js';
import { buildWeekDays, formatWeekRange, computeWeekHits } from './week.js';
import { classifyDay, computeMonthlyAggregates, CLASSIFICATION_MET } from './calendar.js';

const source = fs.readFileSync(path.resolve(__dirname, 'calendar-week-ui.js'), 'utf8');

function buildDoc() {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = '<div id="calendar-week"></div>';
  return doc;
}

const STEPS = {
  '2026-09-21': 11902,
  '2026-09-22': 14411,
  '2026-09-23': 12874,
  '2026-09-24': 17236,
  '2026-09-25': 11190,
  '2026-09-26': 9982,
  '2026-09-27': 13585,
};

function makeWeekPayload(start = '2026-09-21', today = '2026-09-30', navBounds = { canGoPrev: true, canGoNext: true }) {
  const days = buildWeekDays(start, today).map((day) => {
    const steps = STEPS[day.date];
    const record = steps === undefined ? null : { date: day.date, effective_steps: steps };
    const classification = classifyDay(record, 10000, day.isFuture);
    return { ...day, record, classification, inProgress: day.isToday && classification.state < CLASSIFICATION_MET };
  });
  return {
    start, label: formatWeekRange(start), today, days,
    aggregates: computeMonthlyAggregates(days), hits: computeWeekHits(days, today), activeStepGoal: 10000, navBounds,
  };
}

function makeEngine(payload = makeWeekPayload()) {
  return {
    loadWeek: vi.fn(async (start) => (start ? makeWeekPayload(start) : payload)),
    buildZeroState: vi.fn((start) => ({ ...makeWeekPayload(start || '2026-09-28'), days: [] })),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => vi.restoreAllMocks());

describe('calendar-week-ui.js — source', () => {
  it('uses no innerHTML', () => {
    expect(source).not.toMatch(/innerHTML/);
  });
});

describe('createCalendarWeekUI', () => {
  it('shows the week range between previous / next buttons', async () => {
    const doc = buildDoc();
    await createCalendarWeekUI(doc, makeEngine(), { db: vi.fn() }).render();
    expect(doc.querySelector('.period-nav__label').textContent).toBe('21 – 27 Sep 2026');
    expect(doc.querySelector('[data-week-nav="prev"]').getAttribute('aria-label')).toBe('Previous week');
    expect(doc.querySelector('[data-week-nav="next"]').getAttribute('aria-label')).toBe('Next week');
  });

  it('summarises total, daily average and goal-hit days', async () => {
    const doc = buildDoc();
    await createCalendarWeekUI(doc, makeEngine(), { db: vi.fn() }).render();
    const tiles = [...doc.querySelectorAll('.summary-tile')].map((t) => [
      t.querySelector('.summary-tile__label').textContent,
      t.querySelector('.summary-tile__value').textContent,
    ]);
    expect(tiles).toEqual([['Total', '91,180'], ['Daily avg', '13,026'], ['Goal hit', '6 of 7']]);
  });

  it('draws one bar per day, hit and missed told apart, with a goal line', async () => {
    const doc = buildDoc();
    await createCalendarWeekUI(doc, makeEngine(), { db: vi.fn() }).render();
    const cols = doc.querySelectorAll('.week-chart__col');
    expect(cols).toHaveLength(7);
    expect(cols[0].querySelector('.week-chart__bar').classList.contains('week-chart__bar--hit')).toBe(true);
    expect(cols[5].querySelector('.week-chart__bar').classList.contains('week-chart__bar--missed')).toBe(true);
    expect(cols[0].querySelector('.week-chart__value').textContent).toBe('11.9k');
    expect(cols[5].getAttribute('aria-label')).toBe('Sat 26 Sep, 9,982 steps, missed');
    expect(doc.querySelector('.week-chart__goal-label').textContent).toBe('10k goal');
    const tallest = cols[3].querySelector('.week-chart__bar').style.height;
    expect(parseFloat(tallest)).toBeGreaterThan(parseFloat(cols[0].querySelector('.week-chart__bar').style.height));
  });

  it('lists the seven days with their steps', async () => {
    const doc = buildDoc();
    await createCalendarWeekUI(doc, makeEngine(), { db: vi.fn() }).render();
    const rows = [...doc.querySelectorAll('.day-row')];
    expect(rows).toHaveLength(7);
    expect(rows[0].querySelector('.day-row__label').textContent).toBe('Mon 21 Sep');
    expect(rows[0].querySelector('.day-row__steps').textContent).toBe('11,902');
    expect(rows[5].querySelector('.day-row__dot').classList.contains('day-row__dot--missed')).toBe(true);
  });

  it('future days are disabled and show no steps', async () => {
    const doc = buildDoc();
    const payload = makeWeekPayload('2026-09-28', '2026-09-30', { canGoPrev: true, canGoNext: false });
    await createCalendarWeekUI(doc, makeEngine(payload), { db: vi.fn() }).render();
    const rows = doc.querySelectorAll('.day-row');
    expect(rows[3].disabled).toBe(true);
    expect(rows[3].querySelector('.day-row__steps').textContent).toBe('—');
    expect(doc.querySelector('[data-week-nav="next"]').disabled).toBe(true);
  });

  it('tapping a bar or a row opens that day', async () => {
    const doc = buildDoc();
    const onDayClick = vi.fn();
    await createCalendarWeekUI(doc, makeEngine(), { db: vi.fn() }, { onDayClick }).render();
    doc.querySelectorAll('.week-chart__col')[1].click();
    doc.querySelectorAll('.day-row')[2].click();
    expect(onDayClick.mock.calls.map(([day]) => day.date)).toEqual(['2026-09-22', '2026-09-23']);
    expect(onDayClick.mock.calls[0][0].record.effective_steps).toBe(14411);
  });

  it('previous / next load the neighbouring week', async () => {
    const doc = buildDoc();
    const engine = makeEngine();
    await createCalendarWeekUI(doc, engine, { db: vi.fn() }).render();
    doc.querySelector('[data-week-nav="prev"]').click();
    await tick();
    expect(engine.loadWeek).toHaveBeenLastCalledWith('2026-09-14');
    expect(doc.querySelector('.period-nav__label').textContent).toBe('14 – 20 Sep 2026');
    doc.querySelector('[data-week-nav="next"]').click();
    await tick();
    expect(engine.loadWeek).toHaveBeenLastCalledWith('2026-09-21');
  });

  it('re-render keeps the selected week and does not stack content or listeners', async () => {
    const doc = buildDoc();
    const engine = makeEngine();
    const onDayClick = vi.fn();
    const ui = createCalendarWeekUI(doc, engine, { db: vi.fn() }, { onDayClick });
    await ui.render();
    doc.querySelector('[data-week-nav="prev"]').click();
    await tick();
    await ui.render();
    expect(engine.loadWeek).toHaveBeenLastCalledWith('2026-09-14');
    expect(doc.querySelectorAll('.period-nav')).toHaveLength(1);
    doc.querySelector('.day-row').click();
    expect(onDayClick).toHaveBeenCalledTimes(1);
  });

  it('today reads as in progress, not missed', async () => {
    const doc = buildDoc();
    const payload = makeWeekPayload('2026-09-21', '2026-09-26');
    await createCalendarWeekUI(doc, makeEngine(payload), { db: vi.fn() }).render();
    const cols = doc.querySelectorAll('.week-chart__col');
    expect(cols[5].querySelector('.week-chart__bar').classList.contains('week-chart__bar--today')).toBe(true);
    expect(cols[5].getAttribute('aria-label')).toBe('Sat 26 Sep, 9,982 steps, in progress');
    expect(doc.querySelectorAll('.day-row__dot--today')).toHaveLength(1);
    expect(doc.querySelectorAll('.summary-tile__value')[2].textContent).toBe('5 of 5');
  });

  it('a failed load logs, reports and shows an empty week', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const doc = buildDoc();
    const reporter = { db: vi.fn() };
    const engine = makeEngine();
    engine.loadWeek = vi.fn().mockRejectedValue(new Error('db'));
    await createCalendarWeekUI(doc, engine, reporter).render();
    expect(errSpy).toHaveBeenCalledWith('[calendar-week]', expect.any(Error));
    expect(reporter.db).toHaveBeenCalledWith('❌ Week load failed');
    expect(doc.querySelector('.period-nav')).not.toBeNull();
  });

  it('warns and skips without the mount', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = document.implementation.createHTMLDocument('test');
    await expect(createCalendarWeekUI(doc, makeEngine(), { db: vi.fn() }).render()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[calendar-week]', expect.any(String));
  });
});
