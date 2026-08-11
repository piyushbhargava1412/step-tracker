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

    // Count day tiles (leading pad + days + trailing pad) — header cells use .calendar-header-cell
    const allTiles = doc.querySelectorAll('#calendar-grid .calendar-tile');
    const payload = makeSamplePayload();
    const expectedCount = payload.leadingPad + payload.days.length + payload.trailingPad;
    expect(allTiles.length).toBe(expectedCount);
    expect(expectedCount % 7).toBe(0);
    // Weekday header cells rendered separately
    expect(doc.querySelectorAll('#calendar-grid .calendar-header-cell').length).toBe(7);
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

// ---------------------------------------------------------------------------
// Task 4 — Override form + revert wiring (ST-006)
// ---------------------------------------------------------------------------

function makeMockRecords() {
  return {
    overrideRecord: vi.fn().mockResolvedValue(undefined),
    revertRecord: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockProcessImage() {
  return vi.fn().mockResolvedValue('data:image/jpeg;base64,MOCK');
}

function makeSamplePayloadWithRecord(overrideData = null) {
  const payload = makeSamplePayload();
  // Make day 2026-08-05 (index 4) have a record, optionally overridden
  payload.days[4] = {
    ...payload.days[4],
    isFuture: false,
    record: {
      effective_steps: 6000,
      effective_distance_km: 4.5,
      original_steps: 5000,
      original_distance_km: 3.8,
      is_overridden: overrideData !== null,
      override: overrideData,
      synced_at: '2026-08-05T12:00:00Z',
    },
    classification: { state: 2, isOverridden: overrideData !== null },
  };
  return payload;
}

describe('Task 4 — Edit button activation', () => {
  it('Edit button is enabled (disabled === false) after ST-006 activation', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { render } = createCalendarUI(doc, null, engine, reporter, records, processImage);
    await render();

    const tile = doc.querySelector('[data-date="2026-08-05"]');
    tile.click();

    const editBtn = doc.querySelector('[data-action="edit-day"]');
    expect(editBtn).not.toBeNull();
    expect(editBtn.disabled).toBe(false);
  });

  it('Clicking Edit button mounts form with steps, distance, note, and file inputs', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { render } = createCalendarUI(doc, null, engine, reporter, records, processImage);
    await render();

    const tile = doc.querySelector('[data-date="2026-08-05"]');
    tile.click();

    const editBtn = doc.querySelector('[data-action="edit-day"]');
    editBtn.click();

    const drawer = doc.getElementById('day-drawer');
    const stepsInput = drawer.querySelector('input[data-field="effective-steps"]');
    const distInput = drawer.querySelector('input[data-field="effective-distance"]');
    const noteTextarea = drawer.querySelector('textarea[data-field="note"]');
    const fileInput = drawer.querySelector('input[type="file"]');

    expect(stepsInput).not.toBeNull();
    expect(distInput).not.toBeNull();
    expect(noteTextarea).not.toBeNull();
    expect(fileInput).not.toBeNull();
    expect(fileInput.accept).toBe('image/png,image/jpeg,image/webp');
  });

  it('Form pre-populates with current effective_steps and effective_distance_km for overridden day', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord({ note: 'Treadmill session', proof_image_base64: null, updated_at: '2026-08-05T14:00:00Z' });
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { render } = createCalendarUI(doc, null, engine, reporter, records, processImage);
    await render();

    const tile = doc.querySelector('[data-date="2026-08-05"]');
    tile.click();

    const editBtn = doc.querySelector('[data-action="edit-day"]');
    editBtn.click();

    const drawer = doc.getElementById('day-drawer');
    const stepsInput = drawer.querySelector('input[data-field="effective-steps"]');
    const distInput = drawer.querySelector('input[data-field="effective-distance"]');
    const noteTextarea = drawer.querySelector('textarea[data-field="note"]');

    expect(stepsInput.value).toBe('6000');
    expect(distInput.value).toBe('4.5');
    expect(noteTextarea.value).toBe('Treadmill session');
  });

  it('createCalendarUI factory signature accepts records and processImage params without error', () => {
    const doc = buildDoc(getBaseHTML());
    const engine = { loadMonth: vi.fn().mockResolvedValue(makeSamplePayload()), buildZeroState: vi.fn() };
    const reporter = makeMockReporter();
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    expect(() => createCalendarUI(doc, null, engine, reporter, records, processImage)).not.toThrow();
  });
});

describe('Task 4 — Override form submit', () => {
  async function openDrawerAndClickEdit(doc, payload, records, processImage) {
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter, records, processImage);
    await render();

    const tile = doc.querySelector('[data-date="2026-08-05"]');
    tile.click();

    const editBtn = doc.querySelector('[data-action="edit-day"]');
    editBtn.click();

    return { reporter, render };
  }

  it('Valid submit without file calls overrideRecord with proof_image_base64=null; processImage not called', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { reporter } = await openDrawerAndClickEdit(doc, payload, records, processImage);

    const drawer = doc.getElementById('day-drawer');
    const stepsInput = drawer.querySelector('input[data-field="effective-steps"]');
    const noteTextarea = drawer.querySelector('textarea[data-field="note"]');
    const form = drawer.querySelector('form[data-form="override"]');

    stepsInput.value = '7000';
    noteTextarea.value = 'Corrected entry';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(records.overrideRecord).toHaveBeenCalled());
    expect(processImage).not.toHaveBeenCalled();
    const callArgs = records.overrideRecord.mock.calls[0];
    expect(callArgs[0]).toBe('2026-08-05');
    expect(callArgs[1].effective_steps).toBe(7000);
    expect(callArgs[1].note).toBe('Corrected entry');
    expect(callArgs[1].proof_image_base64).toBeNull();
  });

  it('Valid submit with file calls processImage then overrideRecord with processed base64', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const records = makeMockRecords();
    const processImage = vi.fn().mockResolvedValue('data:image/jpeg;base64,PROCESSED');
    const { reporter } = await openDrawerAndClickEdit(doc, payload, records, processImage);

    const drawer = doc.getElementById('day-drawer');
    const stepsInput = drawer.querySelector('input[data-field="effective-steps"]');
    const noteTextarea = drawer.querySelector('textarea[data-field="note"]');
    const fileInput = drawer.querySelector('input[type="file"]');
    const form = drawer.querySelector('form[data-form="override"]');

    stepsInput.value = '7500';
    noteTextarea.value = 'With proof';

    // Simulate file selection
    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(records.overrideRecord).toHaveBeenCalled());
    expect(processImage).toHaveBeenCalledWith(mockFile);
    const callArgs = records.overrideRecord.mock.calls[0];
    expect(callArgs[1].proof_image_base64).toBe('data:image/jpeg;base64,PROCESSED');
  });

  it('Successful override submit dispatches data:records:mutated with { date }', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { reporter } = await openDrawerAndClickEdit(doc, payload, records, processImage);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const drawer = doc.getElementById('day-drawer');
    const stepsInput = drawer.querySelector('input[data-field="effective-steps"]');
    const noteTextarea = drawer.querySelector('textarea[data-field="note"]');
    const form = drawer.querySelector('form[data-form="override"]');

    stepsInput.value = '8000';
    noteTextarea.value = 'Event test';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0));
    expect(events[0].detail.date).toBe('2026-08-05');
  });

  it('processImage rejection surfaces ❌ reporter status; console.error called; event NOT dispatched', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const records = makeMockRecords();
    const processImage = vi.fn().mockRejectedValue(new Error('Bad image'));
    const { reporter } = await openDrawerAndClickEdit(doc, payload, records, processImage);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const drawer = doc.getElementById('day-drawer');
    const stepsInput = drawer.querySelector('input[data-field="effective-steps"]');
    const noteTextarea = drawer.querySelector('textarea[data-field="note"]');
    const fileInput = drawer.querySelector('input[type="file"]');
    const form = drawer.querySelector('form[data-form="override"]');

    stepsInput.value = '7000';
    noteTextarea.value = 'Test note';
    const mockFile = new File(['test'], 'bad.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(reporter.db).toHaveBeenCalled());
    expect(reporter.db).toHaveBeenCalledWith(expect.stringContaining('❌'));
    expect(consoleErrorSpy).toHaveBeenCalledWith('[calendar-ui]', expect.any(Error));
    expect(events.length).toBe(0);
    expect(records.overrideRecord).not.toHaveBeenCalled();
  });

  it('records.overrideRecord rejection surfaces ❌ reporter; event NOT dispatched', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const records = { overrideRecord: vi.fn().mockRejectedValue(new Error('DB write failed')), revertRecord: vi.fn() };
    const processImage = makeMockProcessImage();
    const { reporter } = await openDrawerAndClickEdit(doc, payload, records, processImage);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const drawer = doc.getElementById('day-drawer');
    const stepsInput = drawer.querySelector('input[data-field="effective-steps"]');
    const noteTextarea = drawer.querySelector('textarea[data-field="note"]');
    const form = drawer.querySelector('form[data-form="override"]');

    stepsInput.value = '7000';
    noteTextarea.value = 'Test note';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(reporter.db).toHaveBeenCalled());
    expect(reporter.db).toHaveBeenCalledWith(expect.stringContaining('❌'));
    expect(consoleErrorSpy).toHaveBeenCalledWith('[calendar-ui]', expect.any(Error));
    expect(events.length).toBe(0);
  });

  it('Form listeners under controller.signal; re-render does not stack duplicate handlers', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter, records, processImage);

    // First render, open drawer, click edit, submit
    await render();
    doc.querySelector('[data-date="2026-08-05"]').click();
    doc.querySelector('[data-action="edit-day"]').click();

    const drawer = doc.getElementById('day-drawer');
    drawer.querySelector('input[data-field="effective-steps"]').value = '7000';
    drawer.querySelector('textarea[data-field="note"]').value = 'First';
    const form1 = drawer.querySelector('form[data-form="override"]');
    form1.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(records.overrideRecord).toHaveBeenCalledTimes(1));

    // Second render, open drawer, click edit, submit
    records.overrideRecord.mockClear();
    await render();
    doc.querySelector('[data-date="2026-08-05"]').click();
    doc.querySelector('[data-action="edit-day"]').click();
    const drawer2 = doc.getElementById('day-drawer');
    drawer2.querySelector('input[data-field="effective-steps"]').value = '8000';
    drawer2.querySelector('textarea[data-field="note"]').value = 'Second';
    const form2 = drawer2.querySelector('form[data-form="override"]');
    form2.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(records.overrideRecord).toHaveBeenCalledTimes(1));
    // Should only be called once (not duplicated from old handler)
    expect(records.overrideRecord).toHaveBeenCalledTimes(1);
  });
});

describe('Task 4 — Revert button', () => {
  it('Revert button absent when is_overridden === false', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord(); // not overridden
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { render } = createCalendarUI(doc, null, engine, reporter, records, processImage);
    await render();

    doc.querySelector('[data-date="2026-08-05"]').click();

    const revertBtn = doc.querySelector('[data-action="revert-day"]');
    expect(revertBtn).toBeNull();
  });

  it('Revert button present when is_overridden === true', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord({ note: 'Override', proof_image_base64: null, updated_at: '2026-08-05T12:00:00Z' });
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { render } = createCalendarUI(doc, null, engine, reporter, records, processImage);
    await render();

    doc.querySelector('[data-date="2026-08-05"]').click();

    const revertBtn = doc.querySelector('[data-action="revert-day"]');
    expect(revertBtn).not.toBeNull();
  });

  it('window.confirm returns true → revertRecord called + data:records:mutated dispatched', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord({ note: 'Override', proof_image_base64: null, updated_at: '2026-08-05T12:00:00Z' });
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { render } = createCalendarUI(doc, null, engine, reporter, records, processImage);
    await render();

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    doc.querySelector('[data-date="2026-08-05"]').click();
    const revertBtn = doc.querySelector('[data-action="revert-day"]');
    revertBtn.click();

    await vi.waitFor(() => expect(records.revertRecord).toHaveBeenCalled());
    expect(records.revertRecord).toHaveBeenCalledWith('2026-08-05');
    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0));
    expect(events[0].detail.date).toBe('2026-08-05');
  });

  it('window.confirm returns false → revertRecord not called; no event dispatched', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));

    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord({ note: 'Override', proof_image_base64: null, updated_at: '2026-08-05T12:00:00Z' });
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { render } = createCalendarUI(doc, null, engine, reporter, records, processImage);
    await render();

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    doc.querySelector('[data-date="2026-08-05"]').click();
    const revertBtn = doc.querySelector('[data-action="revert-day"]');
    revertBtn.click();

    // Small wait to ensure nothing was called
    await new Promise(r => setTimeout(r, 50));
    expect(records.revertRecord).not.toHaveBeenCalled();
    expect(events.length).toBe(0);
  });

  it('records.revertRecord rejection surfaces ❌ reporter; event NOT dispatched', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord({ note: 'Override', proof_image_base64: null, updated_at: '2026-08-05T12:00:00Z' });
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const records = {
      overrideRecord: vi.fn().mockResolvedValue(undefined),
      revertRecord: vi.fn().mockRejectedValue(new Error('Revert failed')),
    };
    const processImage = makeMockProcessImage();
    const { render } = createCalendarUI(doc, null, engine, reporter, records, processImage);
    await render();

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    doc.querySelector('[data-date="2026-08-05"]').click();
    const revertBtn = doc.querySelector('[data-action="revert-day"]');
    revertBtn.click();

    await vi.waitFor(() => expect(reporter.db).toHaveBeenCalled());
    expect(reporter.db).toHaveBeenCalledWith(expect.stringContaining('❌'));
    expect(consoleErrorSpy).toHaveBeenCalledWith('[calendar-ui]', expect.any(Error));
    expect(events.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Task 15 — Client-side form validation before overrideRecord
// ---------------------------------------------------------------------------

describe('Task 15 — Form validation before overrideRecord', () => {
  async function openFormForDay(doc, records, processImage) {
    const payload = makeSamplePayloadWithRecord();
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter, records, processImage);
    await render();

    doc.querySelector('[data-date="2026-08-05"]').click();
    doc.querySelector('[data-action="edit-day"]').click();

    const drawer = doc.getElementById('day-drawer');
    return {
      drawer,
      reporter,
      stepsInput: drawer.querySelector('input[data-field="effective-steps"]'),
      noteTextarea: drawer.querySelector('textarea[data-field="note"]'),
      fileInput: drawer.querySelector('input[type="file"]'),
      form: drawer.querySelector('form[data-form="override"]'),
    };
  }

  it('empty steps (NaN) → overrideRecord NOT called; no data:records:mutated event', async () => {
    const doc = buildDoc(getBaseHTML());
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { form, stepsInput, noteTextarea } = await openFormForDay(doc, records, processImage);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    stepsInput.value = '';       // parseInt('') → NaN
    noteTextarea.value = 'Valid note';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 50));
    expect(records.overrideRecord).not.toHaveBeenCalled();
    expect(events.length).toBe(0);
  });

  it('non-integer steps (float text) → overrideRecord NOT called', async () => {
    const doc = buildDoc(getBaseHTML());
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { form, stepsInput, noteTextarea } = await openFormForDay(doc, records, processImage);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    stepsInput.value = '3.5';    // parseInt gives 3, but Number.isInteger(parseFloat('3.5')) is false
    noteTextarea.value = 'Valid note';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 50));
    expect(records.overrideRecord).not.toHaveBeenCalled();
    expect(events.length).toBe(0);
  });

  it('negative steps → overrideRecord NOT called', async () => {
    const doc = buildDoc(getBaseHTML());
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { form, stepsInput, noteTextarea } = await openFormForDay(doc, records, processImage);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    stepsInput.value = '-1';
    noteTextarea.value = 'Valid note';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 50));
    expect(records.overrideRecord).not.toHaveBeenCalled();
    expect(events.length).toBe(0);
  });

  it('empty note (whitespace-only) → overrideRecord NOT called; no data:records:mutated event', async () => {
    const doc = buildDoc(getBaseHTML());
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { form, stepsInput, noteTextarea } = await openFormForDay(doc, records, processImage);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    stepsInput.value = '7000';
    noteTextarea.value = '   ';  // whitespace only
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 50));
    expect(records.overrideRecord).not.toHaveBeenCalled();
    expect(events.length).toBe(0);
  });

  it('invalid steps → processImage NOT called even when file is attached', async () => {
    const doc = buildDoc(getBaseHTML());
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { form, stepsInput, noteTextarea, fileInput } = await openFormForDay(doc, records, processImage);

    stepsInput.value = '';
    noteTextarea.value = 'Valid note';
    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 50));
    expect(processImage).not.toHaveBeenCalled();
    expect(records.overrideRecord).not.toHaveBeenCalled();
  });

  it('invalid input → does NOT call reporter.db (no system-level error message)', async () => {
    const doc = buildDoc(getBaseHTML());
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const payload = makeSamplePayloadWithRecord();
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter, records, processImage);
    await render();

    doc.querySelector('[data-date="2026-08-05"]').click();
    doc.querySelector('[data-action="edit-day"]').click();

    const drawer = doc.getElementById('day-drawer');
    const stepsInput = drawer.querySelector('input[data-field="effective-steps"]');
    const noteTextarea = drawer.querySelector('textarea[data-field="note"]');
    const form = drawer.querySelector('form[data-form="override"]');

    stepsInput.value = '';
    noteTextarea.value = '';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 50));
    expect(reporter.db).not.toHaveBeenCalled();
  });

  it('valid input (steps=0, non-empty note) → overrideRecord IS called', async () => {
    const doc = buildDoc(getBaseHTML());
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { form, stepsInput, noteTextarea } = await openFormForDay(doc, records, processImage);

    stepsInput.value = '0';
    noteTextarea.value = 'Rest day';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(records.overrideRecord).toHaveBeenCalled());
    expect(records.overrideRecord.mock.calls[0][1].effective_steps).toBe(0);
  });
});
