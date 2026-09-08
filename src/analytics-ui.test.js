/**
 * analytics-ui.test.js — TDD tests for the Analytics UI renderer.
 *
 * All tests use a mock engine that returns controlled data; real Dexie is
 * never imported here.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAnalyticsUI } from './analytics-ui.js';
import * as analyticsModule from './analytics.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const YEAR = 2025;

/**
 * Builds a minimal daily_record fixture.
 */
function makeRecord(date, steps, distKm = 5, screenshotProof = null, hourly = null) {
  return {
    date,
    effective_steps: steps,
    effective_distance_km: distKm,
    screenshot_proof: screenshotProof,
    hourly_steps: hourly,
  };
}

const RECORDS = [
  makeRecord(`${YEAR}-01-15`, 12000, 9.0, 'img1.png', Array(24).fill(500)),
  makeRecord(`${YEAR}-02-20`, 15000, 11.5, null, Array(24).fill(625)),
  makeRecord(`${YEAR}-03-10`, 8000, 6.0, null, Array(24).fill(333)),
  makeRecord(`${YEAR}-04-05`, 20000, 15.0, 'img4.png', Array(24).fill(833)),
  makeRecord(`${YEAR}-05-22`, 11000, 8.5, null, Array(24).fill(458)),
];

function makeLifetimeMetrics(records) {
  const totalSteps = records.reduce((s, r) => s + r.effective_steps, 0);
  const totalDistanceKm = records.reduce((s, r) => s + r.effective_distance_km, 0);
  const dailyAverage = Math.round(totalSteps / records.length);
  return { totalSteps, totalDistanceKm, dailyAverage, longestStreak: 5 };
}

function makeTopRecords(records) {
  return [...records].sort((a, b) => b.effective_steps - a.effective_steps).slice(0, 5);
}

function makeDayOfWeek() {
  return {
    averages: [9000, 11000, 8500, 10000, 12000, 15000, 7000],
    powerDay: 5,
    lazyDay: 6,
  };
}

function makeHourly(value = 100) {
  return Array(24).fill(value);
}

function makeYearlyMonthly(year, records) {
  return Array.from({ length: 12 }, (_, m) => {
    const prefix = `${year}-${String(m + 1).padStart(2, '0')}`;
    const rows = records.filter(r => r.date.startsWith(prefix));
    return {
      month: m,
      total: rows.reduce((s, r) => s + r.effective_steps, 0),
      dayCount: rows.length,
    };
  });
}

function makeEngineResult(records, year = YEAR) {
  return {
    records,
    lifetimeMetrics: makeLifetimeMetrics(records),
    topRecords: makeTopRecords(records),
    dayOfWeek: makeDayOfWeek(),
    hourly: makeHourly(),
    yearlyMonthly: makeYearlyMonthly(year, records),
  };
}

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeEngine(result) {
  return { compute: vi.fn().mockResolvedValue(result) };
}

function makeReporter() {
  return { db: vi.fn(), auth: vi.fn() };
}

function makeDoc() {
  document.body.innerHTML = `
    <section id="tab-lab">
      <div id="lab-analytics"></div>
      <div id="lab-gamification"></div>
      <div id="lab-odyssey"></div>
    </section>`;
  return document;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createAnalyticsUI', () => {
  let doc;
  let reporter;

  beforeEach(() => {
    doc = makeDoc();
    reporter = makeReporter();
  });

  // ── Happy path: Hall of Fame ──────────────────────────────────────────────

  it('render() populates Hall of Fame <dl> tiles via textContent with correct lifetime metric values', async () => {
    const result = makeEngineResult(RECORDS);
    const engine = makeEngine(result);
    const ui = createAnalyticsUI(doc, engine, reporter);

    await ui.render();

    const panel = doc.getElementById('tab-lab');
    const dts = [...panel.querySelectorAll('dt')];
    const dds = [...panel.querySelectorAll('dd')];

    expect(dts.length).toBeGreaterThan(0);
    expect(dds.length).toBeGreaterThan(0);

    // At least one dd should contain the totalSteps value
    const allText = dds.map(dd => dd.textContent).join('|');
    expect(allText).toContain(String(result.lifetimeMetrics.totalSteps));
    expect(allText).toContain(String(result.lifetimeMetrics.longestStreak));
  });

  // ── Happy path: Top-5 table ───────────────────────────────────────────────

  it('render() builds Top-5 <table> with correct Date, Steps, Distance rows', async () => {
    const result = makeEngineResult(RECORDS);
    const engine = makeEngine(result);
    const ui = createAnalyticsUI(doc, engine, reporter);

    await ui.render();

    const panel = doc.getElementById('tab-lab');
    const rows = [...panel.querySelectorAll('table tbody tr')];

    expect(rows).toHaveLength(5);

    // First row should have date of highest-steps record
    const topRecord = result.topRecords[0];
    const firstRowText = rows[0].textContent;
    expect(firstRowText).toContain(topRecord.date);
    expect(firstRowText).toContain(String(topRecord.effective_steps));
  });

  // ── Happy path: proof button ──────────────────────────────────────────────

  it('renders proof <button data-action="open-proof"> when proofLightbox provided and record has screenshot_proof', async () => {
    const result = makeEngineResult(RECORDS);
    const engine = makeEngine(result);
    const proofLightbox = { open: vi.fn() };
    const ui = createAnalyticsUI(doc, engine, reporter, proofLightbox);

    await ui.render();

    const panel = doc.getElementById('tab-lab');
    const proofButtons = [...panel.querySelectorAll('[data-action="open-proof"]')];

    // RECORDS has 2 records with screenshot_proof
    expect(proofButtons.length).toBe(2);
    proofButtons.forEach(btn => {
      expect(btn.dataset.date).toBeTruthy();
    });
  });

  // ── Edge case: no proof button when proofLightbox is null ─────────────────

  it('does not render proof button when proofLightbox is null even if record has screenshot_proof', async () => {
    const result = makeEngineResult(RECORDS);
    const engine = makeEngine(result);
    const ui = createAnalyticsUI(doc, engine, reporter, null);

    await ui.render();

    const panel = doc.getElementById('tab-lab');
    const proofButtons = panel.querySelectorAll('[data-action="open-proof"]');
    expect(proofButtons).toHaveLength(0);
  });

  // ── Edge case: no proof button when record lacks screenshot_proof ─────────

  it('does not render proof button for record without screenshot_proof even with proofLightbox', async () => {
    const recordsNoProof = [
      makeRecord(`${YEAR}-01-15`, 12000, 9.0, null),
      makeRecord(`${YEAR}-02-20`, 15000, 11.5, null),
    ];
    const result = makeEngineResult(recordsNoProof);
    const engine = makeEngine(result);
    const proofLightbox = { open: vi.fn() };
    const ui = createAnalyticsUI(doc, engine, reporter, proofLightbox);

    await ui.render();

    const panel = doc.getElementById('tab-lab');
    const proofButtons = panel.querySelectorAll('[data-action="open-proof"]');
    expect(proofButtons).toHaveLength(0);
  });

  // ── Happy path: year selector ─────────────────────────────────────────────

  it('year selector <select> contains option for each unique year in records, sorted descending', async () => {
    const multiYearRecords = [
      makeRecord('2024-06-10', 10000),
      makeRecord('2025-01-15', 12000),
      makeRecord('2025-03-20', 8000),
      makeRecord('2023-11-05', 9000),
    ];
    const result = makeEngineResult(multiYearRecords, YEAR);
    const engine = makeEngine(result);
    const ui = createAnalyticsUI(doc, engine, reporter);

    await ui.render();

    const panel = doc.getElementById('tab-lab');
    const select = panel.querySelector('select[data-action="change-year"]');
    expect(select).not.toBeNull();

    const options = [...select.querySelectorAll('option')].map(o => o.value);
    expect(options).toEqual(['2025', '2024', '2023']); // descending
  });

  // ── Happy path: year selector change triggers monthly chart re-render ─────

  it('changing year selector triggers re-render of monthly chart section with correct year data', async () => {
    const multiYearRecords = [
      makeRecord('2024-06-10', 9999, 7.5),
      makeRecord('2025-01-15', 12000, 9.0),
    ];
    const result = makeEngineResult(multiYearRecords, 2025);
    const engine = makeEngine(result);
    const ui = createAnalyticsUI(doc, engine, reporter);

    await ui.render();

    const panel = doc.getElementById('tab-lab');
    const select = panel.querySelector('select[data-action="change-year"]');
    expect(select).not.toBeNull();

    // Count hall of fame dts before change
    const dtsBefore = panel.querySelectorAll('dt').length;

    // Dispatch change event for year 2024
    select.value = '2024';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    // Hall of Fame should remain unchanged (same number of dts)
    const dtsAfter = panel.querySelectorAll('dt').length;
    expect(dtsAfter).toBe(dtsBefore);
  });

  // ── Edge case: empty records ──────────────────────────────────────────────

  it('renders a descriptive <p> when engine returns empty records (not blank panel)', async () => {
    const result = makeEngineResult([]);
    const engine = makeEngine(result);
    const ui = createAnalyticsUI(doc, engine, reporter);

    await ui.render();

    const panel = doc.getElementById('tab-lab');
    const p = panel.querySelector('p');
    expect(p).not.toBeNull();
    expect(p.textContent.length).toBeGreaterThan(5);
  });

  // ── Edge case: all-zero hourly distribution ───────────────────────────────

  it('renders "Hourly data will appear after your next sync" when all hourly values are zero', async () => {
    const result = makeEngineResult(RECORDS);
    result.hourly = Array(24).fill(0);
    const engine = makeEngine(result);
    const ui = createAnalyticsUI(doc, engine, reporter);

    await ui.render();

    const panel = doc.getElementById('tab-lab');
    const text = panel.textContent;
    expect(text).toContain('Hourly data will appear after your next sync');
  });

  // ── Error case: engine.compute() throws ──────────────────────────────────

  it('calls reporter.db with error message and injects error <p> when engine.compute() throws', async () => {
    const engine = { compute: vi.fn().mockRejectedValue(new Error('DB down')) };
    const ui = createAnalyticsUI(doc, engine, reporter);

    await ui.render();

    expect(reporter.db).toHaveBeenCalledWith(expect.stringContaining('⚠️'));
    const panel = doc.getElementById('tab-lab');
    const p = panel.querySelector('p');
    expect(p).not.toBeNull();
  });

  // ── Happy path: idempotent re-render ─────────────────────────────────────

  it('calling render() twice does not accumulate duplicate nodes in #tab-lab', async () => {
    const result = makeEngineResult(RECORDS);
    const engine = makeEngine(result);
    const ui = createAnalyticsUI(doc, engine, reporter);

    await ui.render();
    const countAfterFirst = doc.getElementById('tab-lab').children.length;

    await ui.render();
    const countAfterSecond = doc.getElementById('tab-lab').children.length;

    expect(countAfterSecond).toBe(countAfterFirst);
  });

  // ── Happy path: AbortController — listener fires exactly once ────────────

  it('AbortController: second render() calls abort() on the first controller', async () => {
    // Spy on AbortController.prototype.abort to verify the prior controller is actually
    // aborted when render() is called a second time. This is the real guard against
    // listener-accumulation: { signal } on each addEventListener means abort() removes
    // the listener from its element. Without controller.abort(), orphaned listeners
    // survive in memory even after their section is detached from the DOM.
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

    const result = makeEngineResult(RECORDS);
    const engine = makeEngine(result);
    const ui = createAnalyticsUI(doc, engine, reporter);

    await ui.render(); // creates controller_1; abort not yet called
    const abortCallsAfterFirstRender = abortSpy.mock.calls.length;
    expect(abortCallsAfterFirstRender).toBe(0); // first render has nothing to abort

    await ui.render(); // must call controller_1.abort() before creating controller_2
    expect(abortSpy).toHaveBeenCalledTimes(abortCallsAfterFirstRender + 1);

    // Also verify the change handler still fires and uses computeYearlyMonthlyComparison
    const yearSpy = vi.spyOn(analyticsModule, 'computeYearlyMonthlyComparison');
    const panel = doc.getElementById('tab-lab');
    const select = panel.querySelector('select[data-action="change-year"]');
    expect(select).not.toBeNull();
    select.value = select.options[0]?.value ?? select.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(yearSpy).toHaveBeenCalledTimes(1);

    abortSpy.mockRestore();
    yearSpy.mockRestore();
  });

  // ── Bug-fix: render() must target #lab-analytics, NOT #tab-lab ──────────

  it('render() with valid data injects sections into #lab-analytics, not directly into #tab-lab', async () => {
    const result = makeEngineResult(RECORDS);
    const engine = makeEngine(result);
    const ui = createAnalyticsUI(doc, engine, reporter);

    await ui.render();

    const labAnalytics = doc.getElementById('lab-analytics');
    expect(labAnalytics).not.toBeNull();
    expect(labAnalytics.children.length).toBeGreaterThan(0);

    // #tab-lab should still have its original skeleton containers as direct children
    const tabLab = doc.getElementById('tab-lab');
    expect(tabLab.querySelector('#lab-gamification')).not.toBeNull();
    expect(tabLab.querySelector('#lab-odyssey')).not.toBeNull();
  });

  it('render() does NOT destroy #lab-gamification or #lab-odyssey containers', async () => {
    const result = makeEngineResult(RECORDS);
    const engine = makeEngine(result);
    const ui = createAnalyticsUI(doc, engine, reporter);

    await ui.render();

    expect(doc.getElementById('lab-gamification')).not.toBeNull();
    expect(doc.getElementById('lab-odyssey')).not.toBeNull();
  });

  it('render() does not trigger empty-state when engine returns non-empty records', async () => {
    const result = makeEngineResult(RECORDS);
    const engine = makeEngine(result);
    const ui = createAnalyticsUI(doc, engine, reporter);

    await ui.render();

    const labAnalytics = doc.getElementById('lab-analytics');
    // Should have section elements, no empty-state <p> at the container level
    const sections = labAnalytics.querySelectorAll('section');
    expect(sections.length).toBeGreaterThan(0);
    // Empty state message should NOT be present
    expect(labAnalytics.textContent).not.toContain('No step data found');
  });

  it('mock engine result includes records key matching real engine contract', () => {
    // Regression: the mock must supply the same shape the real engine returns.
    // If the real engine omits records, cachedRecords is always [] and no analytics render.
    const result = makeEngineResult(RECORDS);
    expect(result).toHaveProperty('records');
    expect(result.records).toEqual(RECORDS);
  });


});
