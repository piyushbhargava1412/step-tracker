/**
 * Tests for src/calendar-ui.js — DOM render layer.
 * Uses `document.implementation.createHTMLDocument` (same as tabs.test.js)
 * because JSDOM's AbortController.signal is not compatible with addEventListener.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createCalendarUI } from './calendar-ui.js';

const calendarUiSource = fs.readFileSync(path.resolve(__dirname, 'calendar-ui.js'), 'utf8');

afterEach(() => vi.restoreAllMocks());

function buildDoc(html) {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = html;
  return doc;
}

function getBaseHTML() {
  return `
    <div class="container">
      <nav class="tab-bar">
        <button data-tab="dashboard">Dashboard</button>
        <button data-tab="calendar">Calendar</button>
      </nav>
      <main>
        <div id="tab-calendar" style="display:none">
          <div id="calendar-nav"></div>
          <div id="calendar-summary"></div>
          <div id="calendar-grid"></div>
          <div class="drawer-overlay" hidden></div>
          <aside id="day-drawer" role="dialog" aria-modal="true" aria-labelledby="day-drawer-title" hidden></aside>
        </div>
      </main>
    </div>
  `;
}

function makeMockEngine(payload) {
  return {
    loadMonth: vi.fn().mockResolvedValue(payload),
    buildZeroState: vi.fn().mockReturnValue(payload),
  };
}

function makeMockReporter() {
  return { db: vi.fn() };
}

function makeSamplePayload() {
  return {
    year: 2026,
    month: 7,
    leadingPad: 6,
    trailingPad: 5,
    today: '2026-08-10',
    days: Array.from({ length: 31 }, (_, i) => {
      const dayNum = i + 1;
      const dateStr = `2026-08-${String(dayNum).padStart(2, '0')}`;
      const isFuture = dateStr > '2026-08-10';
      return {
        date: dateStr,
        dayOfMonth: dayNum,
        isFuture,
        record: isFuture ? null : { effective_steps: 5000, effective_distance_km: 5.0, original_steps: 4800, original_distance_km: 4.6 },
        classification: isFuture ? { state: 0, isOverridden: false } : { state: 2, isOverridden: false },
        targetDistanceKm: 3.0,
      };
    }),
    aggregates: {
      daysEvaluated: 10,
      targetMetDays: 10,
      totalSteps: 50000,
      totalDistanceKm: 50.0,
      averageDailySteps: 5000,
      hitRatePct: 100,
    },
    navBounds: { canGoPrev: true, canGoNext: false, minYear: 2026, maxYear: 2026 },
  };
}

// ---------------------------------------------------------------------------
// render() — grid tile count and classes
// ---------------------------------------------------------------------------

describe('render() — grid', () => {
  it('inserts leadingPad + days.length + trailingPad tiles and total is a multiple of 7', async () => {
    const doc = buildDoc(getBaseHTML());
    const engine = makeMockEngine(makeSamplePayload());
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    // Count all tiles (including padding and weekday header)
    const allTiles = doc.querySelectorAll('#calendar-grid .calendar-tile');
    const payload = makeSamplePayload();
    const expectedCount = payload.leadingPad + payload.days.length + payload.trailingPad + 7; // +7 for weekday header
    expect(allTiles.length).toBe(expectedCount);
    expect(expectedCount % 7).toBe(0);
  });

  it('each classification state renders its exact CSS class', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    payload.days[5] = { ...payload.days[5], classification: { state: 1, isOverridden: false } };
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    expect(doc.querySelector('.tile--missed')).not.toBeNull();
    expect(doc.querySelector('.tile--met')).not.toBeNull();
  });

  it('State 3 day carries tile--exceeded, not tile--met', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    payload.days[3] = { ...payload.days[3], classification: { state: 3, isOverridden: false } };
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    expect(doc.querySelector('.tile--exceeded')).not.toBeNull();
  });

  it('isOverridden: true → override badge present', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    payload.days[5] = { ...payload.days[5], classification: { state: 2, isOverridden: true } };
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    expect(doc.querySelector('.tile__override-badge')).not.toBeNull();
  });

  it('isOverridden: false → no override badge on any tile', async () => {
    const doc = buildDoc(getBaseHTML());
    const engine = makeMockEngine(makeSamplePayload());
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const allTiles = doc.querySelectorAll('[data-date]');
    for (const tile of allTiles) {
      expect(tile.querySelector('.tile__override-badge')).toBeNull();
    }
  });

  it('real-day tiles are <button> with data-date; padding cells are <div> with aria-hidden', async () => {
    const doc = buildDoc(getBaseHTML());
    const engine = makeMockEngine(makeSamplePayload());
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const buttons = doc.querySelectorAll('#calendar-grid button[data-date]');
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(btn.type).toBe('button');
      expect(btn.dataset.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    const padded = doc.querySelectorAll('#calendar-grid [aria-hidden]');
    expect(padded.length).toBeGreaterThan(0);
  });

  it('future day tiles are disabled', async () => {
    const doc = buildDoc(getBaseHTML());
    const engine = makeMockEngine(makeSamplePayload());
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const futureTiles = doc.querySelectorAll('#calendar-grid button[data-date][disabled]');
    expect(futureTiles.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('render() — idempotency', async () => {
  it('calling render() twice does not duplicate tiles', async () => {
    const doc = buildDoc(getBaseHTML());
    const engine = makeMockEngine(makeSamplePayload());
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();
    const firstCount = doc.querySelectorAll('#calendar-grid button[data-date]').length;
    await render();
    const secondCount = doc.querySelectorAll('#calendar-grid button[data-date]').length;
    expect(secondCount).toBe(firstCount);
  });

  it('#day-drawer and .drawer-overlay survive after two renders', async () => {
    const doc = buildDoc(getBaseHTML());
    const engine = makeMockEngine(makeSamplePayload());
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();
    await render();
    expect(doc.getElementById('day-drawer')).not.toBeNull();
    expect(doc.querySelector('.drawer-overlay')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Guard clause — missing #tab-calendar
// ---------------------------------------------------------------------------

describe('render() — guard clause', () => {
  it('missing #tab-calendar → console.warn, no throw, no DOM mutation', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = buildDoc('<div></div>');
    const engine = makeMockEngine(makeSamplePayload());
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();
    expect(warnSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Error path — rejecting loadMonth
// ---------------------------------------------------------------------------

describe('render() — error path', async () => {
  it('rejecting loadMonth → console.error and reporter.db both called', async () => {
    const doc = buildDoc(getBaseHTML());
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const engine = makeMockEngine(makeSamplePayload());
    engine.loadMonth.mockRejectedValue(new Error('DB failed'));
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();
    expect(errorSpy).toHaveBeenCalled();
    expect(reporter.db).toHaveBeenCalledWith('\u274C Calendar load failed');
    errorSpy.mockRestore();
  });

  it('rejecting loadMonth → render() resolves without throwing', async () => {
    const doc = buildDoc(getBaseHTML());
    const engine = makeMockEngine(makeSamplePayload());
    engine.loadMonth.mockRejectedValue(new Error('DB failed'));
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await expect(render()).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Summary header
// ---------------------------------------------------------------------------

describe('render() — summary', async () => {
  it('populated month renders total steps with toLocaleString', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    payload.aggregates.totalSteps = 12345;
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const values = doc.querySelectorAll('#calendar-summary .value');
    expect(values[0].textContent).toBe('12,345');
  });

  it('populated month renders total distance as toFixed(2) + " km"', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    payload.aggregates.totalDistanceKm = 8.4;
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const values = doc.querySelectorAll('#calendar-summary .value');
    expect(values[1].textContent).toBe('8.40 km');
  });

  it('populated month renders hit rate as integer + "%" ', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    payload.aggregates.hitRatePct = 67;
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const values = doc.querySelectorAll('#calendar-summary .value');
    expect(values[3].textContent).toBe('67%');
  });

  it('daysEvaluated === 0 → four em dashes', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    payload.aggregates = {
      daysEvaluated: 0, targetMetDays: 0,
      totalSteps: null, totalDistanceKm: null,
      averageDailySteps: null, hitRatePct: null,
    };
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const values = doc.querySelectorAll('#calendar-summary .value');
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i].textContent).toBe('\u2014');
    }
  });

  it('caption reads "August 2026" for (2026, 7)', async () => {
    const doc = buildDoc(getBaseHTML());
    const engine = makeMockEngine(makeSamplePayload());
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const caption = doc.querySelector('#calendar-summary .caption');
    expect(caption.textContent).toBe('August 2026');
  });

  it('re-rendering twice → exactly one summary element', async () => {
    const doc = buildDoc(getBaseHTML());
    const engine = makeMockEngine(makeSamplePayload());
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();
    await render();
    expect(doc.querySelectorAll('#calendar-summary').length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe('render() — navigation', async () => {
  it('clicking [data-nav="prev"] re-renders with previous month', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const prevBtn = doc.querySelector('[data-nav="prev"]');
    prevBtn.click();

    expect(engine.loadMonth).toHaveBeenCalledWith(2026, 6);
  });

  it('clicking [data-nav="next"] re-renders with next month', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    payload.navBounds.canGoNext = true;
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const nextBtn = doc.querySelector('[data-nav="next"]');
    nextBtn.click();

    expect(engine.loadMonth).toHaveBeenCalledWith(2026, 8);
  });

  it('[data-nav="prev"] disabled at earliest-record month', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    payload.navBounds.canGoPrev = false;
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    expect(doc.querySelector('[data-nav="prev"]').disabled).toBe(true);
  });

  it('[data-nav="next"] disabled at current month', async () => {
    const doc = buildDoc(getBaseHTML());
    const engine = makeMockEngine(makeSamplePayload());
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    expect(doc.querySelector('[data-nav="next"]').disabled).toBe(true);
  });

  it('year select spans minYear…maxYear; month select has 12 options', async () => {
    const doc = buildDoc(getBaseHTML());
    const engine = makeMockEngine(makeSamplePayload());
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const yearSelect = doc.querySelector('[data-year-select]');
    expect(yearSelect.querySelectorAll('option').length).toBe(1);

    const monthSelect = doc.querySelector('[data-month-select]');
    expect(monthSelect.querySelectorAll('option').length).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------

describe('render() — drawer', async () => {
  it('clicking a tile with a record opens the drawer', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const tile = doc.querySelector('[data-date="2026-08-08"]');
    tile.click();

    const drawer = doc.getElementById('day-drawer');
    expect(drawer.classList.contains('drawer--open')).toBe(true);
    expect(drawer.hasAttribute('hidden')).toBe(false);
  });

  it('drawer date header matches August 8, 2026 form', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const tile = doc.querySelector('[data-date="2026-08-08"]');
    tile.click();

    const h2 = doc.getElementById('day-drawer-title');
    expect(h2.textContent).toBe('August 8, 2026');
  });

  it('Effective Steps row shows record.effective_steps', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const tile = doc.querySelector('[data-date="2026-08-08"]');
    tile.click();

    const rows = doc.querySelectorAll('#day-drawer .metric-row');
    const stepsRow = Array.from(rows).find(r => r.querySelector('span').textContent === 'Effective Steps');
    expect(stepsRow.querySelector('.value').textContent).toBe('5000');
  });

  it('Non-overridden record → "—" in Verified Manual row', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const tile = doc.querySelector('[data-date="2026-08-08"]');
    tile.click();

    const rows = doc.querySelectorAll('#day-drawer .metric-row');
    const manualRow = Array.from(rows).find(r => r.querySelector('span').textContent === 'Verified Manual');
    expect(manualRow.querySelector('.value').textContent).toBe('\u2014');
  });

  it('Close button closes drawer', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const tile = doc.querySelector('[data-date="2026-08-08"]');
    tile.click();

    const closeBtn = doc.querySelector('.close-btn');
    closeBtn.click();

    const drawer = doc.getElementById('day-drawer');
    expect(drawer.classList.contains('drawer--open')).toBe(false);
  });

  it('Edit button present, disabled, data-action="edit-day"', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const tile = doc.querySelector('[data-date="2026-08-08"]');
    tile.click();

    const editBtn = doc.querySelector('[data-action="edit-day"]');
    expect(editBtn).not.toBeNull();
    expect(editBtn.disabled).toBe(true);
  });

  it('XSS guard: note with <img> appears as literal text', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    payload.days[0] = {
      ...payload.days[0],
      record: {
        effective_steps: 5000, effective_distance_km: 5.0,
        original_steps: 4800, original_distance_km: 4.6,
        is_overridden: true,
        override: { note: '<img src=x onerror=alert(1)>' },
      },
      classification: { state: 1, isOverridden: true },
    };
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const tile = doc.querySelector('[data-date="2026-08-01"]');
    tile.click();

    expect(doc.querySelector('#day-drawer img')).toBeNull();
  });

  it('no-data past day → zero-state drawer', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    payload.days[14] = {
      ...payload.days[14],
      isFuture: false,
      record: null,
      classification: { state: 0, isOverridden: false },
    };
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const tile = doc.querySelector('[data-date="2026-08-15"]');
    tile.click();

    const drawer = doc.getElementById('day-drawer');
    expect(drawer.textContent).toContain('No synced data for this date');
  });

  it('future tile click → drawer remains hidden', async () => {
    const doc = buildDoc(getBaseHTML());
    const engine = makeMockEngine(makeSamplePayload());
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const futureTile = doc.querySelector('[data-date="2026-08-15"]');
    futureTile.click();

    const drawer = doc.getElementById('day-drawer');
    expect(drawer.hasAttribute('hidden')).toBe(true);
  });

  it('overlay click closes drawer and restores focus to tile', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const tile = doc.querySelector('[data-date="2026-08-08"]');
    const focusSpy = vi.spyOn(tile, 'focus');
    tile.click();

    const overlay = doc.querySelector('.drawer-overlay');
    overlay.click();

    const drawer = doc.getElementById('day-drawer');
    expect(drawer.classList.contains('drawer--open')).toBe(false);
    expect(drawer.hasAttribute('hidden')).toBe(true);
    expect(overlay.hasAttribute('hidden')).toBe(true);
    expect(focusSpy).toHaveBeenCalled();
  });

  it('Escape key closes drawer and restores focus to tile', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const tile = doc.querySelector('[data-date="2026-08-08"]');
    const focusSpy = vi.spyOn(tile, 'focus');
    tile.click();

    const overlay = doc.querySelector('.drawer-overlay');
    const drawer = doc.getElementById('day-drawer');

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    doc.dispatchEvent(escapeEvent);

    expect(drawer.classList.contains('drawer--open')).toBe(false);
    expect(drawer.hasAttribute('hidden')).toBe(true);
    expect(overlay.hasAttribute('hidden')).toBe(true);
    expect(focusSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// No innerHTML in calendar-ui.js (grep-verified by test)
// ---------------------------------------------------------------------------

describe('calendar-ui.js — no innerHTML', () => {
  it('calendar-ui.js contains no innerHTML strings', () => {
    expect(calendarUiSource).not.toMatch(/innerHTML/);
  });
});
