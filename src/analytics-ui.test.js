/**
 * analytics-ui.test.js — the Insights screen renderer.
 * A mock engine returns controlled data; real Dexie is never imported.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createAnalyticsUI } from './analytics-ui.js';
import { computeInsights, extractYears, computeYearlyMonthlyComparison } from './analytics.js';

const source = fs.readFileSync(path.resolve(__dirname, 'analytics-ui.js'), 'utf8');

function makeRecord(date, steps, distKm = steps / 1300, screenshotProof = null, hourly = null) {
  return { date, effective_steps: steps, effective_distance_km: distKm, screenshot_proof: screenshotProof, hourly_steps: hourly };
}

const HOURLY = Array.from({ length: 24 }, (_, h) => (h === 18 ? 900 : h > 6 && h < 23 ? 300 : 0));

const RECORDS = [
  makeRecord('2025-05-05', 17971, 13.69, 'img1.png', HOURLY),
  makeRecord('2025-01-20', 17919, 13.65, null, HOURLY),
  makeRecord('2026-05-19', 17910, 13.65, 'img3.png', HOURLY),
  makeRecord('2026-03-02', 8000, 6.1, null, HOURLY),
  makeRecord('2026-03-03', 11000, 8.4, null, HOURLY),
  makeRecord('2024-06-19', 17880, 13.63, null, HOURLY),
];

/** A result shaped like createAnalytics().compute(). */
function makeEngineResult(records = RECORDS, activeStepGoal = 10000) {
  return {
    records,
    ...computeInsights(records, activeStepGoal),
    yearlyMonthly: computeYearlyMonthlyComparison(records, new Date().getFullYear()),
    activeStepGoal,
    years: extractYears(records),
  };
}

const makeEngine = (result = makeEngineResult()) => ({ compute: vi.fn().mockResolvedValue(result) });
const makeReporter = () => ({ db: vi.fn() });

function makeDoc() {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = '<section id="tab-insights"><div id="lab-analytics"></div></section>';
  return doc;
}

const texts = (root, selector) => [...root.querySelectorAll(selector)].map((el) => el.textContent);

afterEach(() => vi.restoreAllMocks());

describe('analytics-ui.js — source', () => {
  it('uses no innerHTML', () => {
    expect(source).not.toMatch(/innerHTML/);
  });
});

describe('Insights — sections', () => {
  let doc;
  beforeEach(async () => {
    doc = makeDoc();
    await createAnalyticsUI(doc, makeEngine(), makeReporter()).render();
  });

  it('renders the range switch then five titled sections, without emoji', () => {
    expect(doc.querySelector('#lab-analytics > .insights-range')).not.toBeNull();
    expect(texts(doc, '#lab-analytics .section-title')).toEqual(['Hall of fame', 'Top days', 'By weekday', 'Time of day', 'Monthly totals']);
    expect(doc.getElementById('lab-analytics').textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('Hall of fame: four tiles', () => {
    const labels = texts(doc, '.hof-tile__label');
    expect(labels).toEqual(['Total steps', 'Distance', 'Daily average', 'Longest streak']);
    const values = texts(doc, '.hof-tile__value');
    expect(values[0]).toBe('90,680');
    expect(values[1]).toBe('69 km');
    expect(values[3]).toMatch(/^\d+ days?$/);
  });

  it('Top days: a ranked list, best first, with steps and distance', () => {
    const rows = doc.querySelectorAll('.rank-list__item');
    expect(rows).toHaveLength(5);
    expect(rows[0].querySelector('.rank-list__rank').textContent).toBe('1');
    expect(rows[0].querySelector('.rank-list__date').textContent).toBe('5 May 2025');
    expect(rows[0].querySelector('.rank-list__steps').textContent).toBe('17,971');
    expect(rows[0].querySelector('.rank-list__km').textContent).toBe('13.7 km');
  });

  it('By weekday: names the strongest and quietest days and highlights them', () => {
    expect(doc.querySelector('.analytics-weekday .section-sub').textContent).toMatch(/^\w+day is your strongest day · \w+day your quietest$/);
    expect(doc.querySelectorAll('.analytics-weekday .bar-chart__col')).toHaveLength(7);
    expect(doc.querySelectorAll('.analytics-weekday .bar-chart__bar--peak')).toHaveLength(1);
  });

  it('Time of day: 24 bars, the busiest hour named and highlighted, sparse tick labels', () => {
    expect(doc.querySelectorAll('.analytics-hourly .bar-chart__col')).toHaveLength(24);
    expect(doc.querySelector('.analytics-hourly .section-sub').textContent).toBe('Most steps land around 6 pm');
    expect(doc.querySelector('.analytics-hourly .bar-chart__col:nth-child(19) .bar-chart__bar').classList.contains('bar-chart__bar--peak')).toBe(true);
    expect(texts(doc, '.analytics-hourly .chart-ticks span')).toEqual(['12a', '6a', '12p', '6p', '11p']);
    expect(doc.querySelectorAll('.analytics-hourly .bar-chart__value')).toHaveLength(0);
  });

  it('Monthly totals: horizontal bars with a year picker', () => {
    const select = doc.querySelector('.analytics-yearly select[data-action="change-year"]');
    expect([...select.options].map((o) => o.value)).toEqual(['2026', '2025', '2024']);
    expect(select.getAttribute('aria-label')).toBe('Year');
    expect(doc.querySelectorAll('.analytics-yearly .hbar')).toHaveLength(12);
  });
});

describe('Insights — range switch', () => {
  it('offers All time and each year with data, All time selected', async () => {
    const doc = makeDoc();
    await createAnalyticsUI(doc, makeEngine(), makeReporter()).render();
    const options = [...doc.querySelectorAll('.insights-range [data-range]')];
    expect(options.map((o) => o.textContent)).toEqual(['All time', '2026', '2025', '2024']);
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(doc.querySelector('.insights-range').getAttribute('role')).toBe('tablist');
  });

  it('picking a year limits every section to that year', async () => {
    const doc = makeDoc();
    const engine = makeEngine();
    await createAnalyticsUI(doc, engine, makeReporter()).render();
    doc.querySelector('[data-range="2026"]').click();

    expect(doc.querySelector('[data-range="2026"]').getAttribute('aria-selected')).toBe('true');
    expect(doc.querySelector('.hof-tile__value').textContent).toBe('36,910');
    expect(texts(doc, '.rank-list__date')).toEqual(['19 May 2026', '3 Mar 2026', '2 Mar 2026']);
    expect(doc.querySelector('.analytics-yearly select')).toBeNull();
    expect(doc.querySelector('.analytics-yearly .section-sub').textContent).toBe('2026');
    expect(engine.compute).toHaveBeenCalledTimes(1);
  });

  it('keeps the chosen year across re-renders, and falls back to All time when it has no data any more', async () => {
    const doc = makeDoc();
    const engine = makeEngine();
    const ui = createAnalyticsUI(doc, engine, makeReporter());
    await ui.render();
    doc.querySelector('[data-range="2025"]').click();
    await ui.render();
    expect(doc.querySelector('[data-range="2025"]').getAttribute('aria-selected')).toBe('true');

    engine.compute.mockResolvedValue(makeEngineResult(RECORDS.filter((r) => !r.date.startsWith('2025'))));
    await ui.render();
    expect(doc.querySelector('[data-range="all"]').getAttribute('aria-selected')).toBe('true');
  });
});

describe('Insights — proof photos', () => {
  it('shows a labelled proof button for records with proof, when a lightbox is provided', async () => {
    const doc = makeDoc();
    const proofLightbox = { open: vi.fn() };
    await createAnalyticsUI(doc, makeEngine(), makeReporter(), proofLightbox).render();
    const buttons = doc.querySelectorAll('[data-action="open-proof"]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('aria-label')).toBe('View proof for 5 May 2025');
    buttons[0].click();
    expect(proofLightbox.open).toHaveBeenCalledWith(expect.objectContaining({ date: '2025-05-05' }));
  });

  it('no proof buttons without a lightbox', async () => {
    const doc = makeDoc();
    await createAnalyticsUI(doc, makeEngine(), makeReporter(), null).render();
    expect(doc.querySelectorAll('[data-action="open-proof"]')).toHaveLength(0);
  });
});

describe('Insights — edge cases', () => {
  it('year picker changes the monthly chart only', async () => {
    const doc = makeDoc();
    await createAnalyticsUI(doc, makeEngine(), makeReporter()).render();
    const before = doc.querySelector('.hof-tile__value').textContent;
    const select = doc.querySelector('.analytics-yearly select');
    select.value = '2024';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const bars = [...doc.querySelectorAll('.analytics-yearly .hbar__fill')].map((b) => b.style.width);
    expect(bars[5]).toBe('100%'); // June 2024 is the only month
    expect(doc.querySelector('.hof-tile__value').textContent).toBe(before);
  });

  it('empty records → a helpful message', async () => {
    const doc = makeDoc();
    await createAnalyticsUI(doc, makeEngine(makeEngineResult([])), makeReporter()).render();
    expect(doc.getElementById('lab-analytics').textContent).toBe('No step data found. Sync your steps to see analytics here.');
  });

  it('no hourly data → a message instead of the chart', async () => {
    const doc = makeDoc();
    const records = RECORDS.map((r) => ({ ...r, hourly_steps: null }));
    await createAnalyticsUI(doc, makeEngine(makeEngineResult(records)), makeReporter()).render();
    expect(doc.querySelector('.analytics-hourly').textContent).toContain('Hourly data will appear after your next sync');
  });

  it('a failed compute is reported and shown', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const doc = makeDoc();
    const reporter = makeReporter();
    await createAnalyticsUI(doc, { compute: vi.fn().mockRejectedValue(new Error('x')) }, reporter).render();
    expect(reporter.db).toHaveBeenCalledWith('⚠️ Could not render Analytics');
    expect(doc.getElementById('lab-analytics').textContent).toBe('Analytics could not be loaded. Please try again.');
  });

  it('re-rendering replaces content', async () => {
    const doc = makeDoc();
    const ui = createAnalyticsUI(doc, makeEngine(), makeReporter());
    await ui.render();
    await ui.render();
    expect(doc.querySelectorAll('.insights-range')).toHaveLength(1);
    expect(doc.querySelectorAll('.analytics-hall-of-fame')).toHaveLength(1);
  });

  it('warns without the mount', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = document.implementation.createHTMLDocument('t');
    await createAnalyticsUI(doc, makeEngine(), makeReporter()).render();
    expect(warn).toHaveBeenCalledWith('[analytics-ui]', expect.any(String));
  });
});
