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
    activeStepGoal: 5000,
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

  it('summary shows NO distance cell', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    payload.aggregates.totalDistanceKm = 8.4;
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const labels = Array.from(doc.querySelectorAll('#calendar-summary .summary-cell span:first-child'));
    expect(labels.some((el) => el.textContent === 'Total Distance')).toBe(false);
    expect(doc.querySelector('#calendar-summary .value')).not.toBeNull();
  });

  it('populated month renders elapsed-day commitment hit rate as integer + "%" ', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    payload.aggregates.hitRatePct = 67;
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const values = doc.querySelectorAll('#calendar-summary .value');
    expect(values[2].textContent).toBe('100%');
  });

  it('hit rate uses elapsed classified days rather than record aggregates', async () => {
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
    expect(values[2].textContent).toBe('100%');
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

  it('drawer has no Effective Distance row; Synced (Google Fit) shows steps only', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayload();
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const { render } = createCalendarUI(doc, null, engine, reporter);
    await render();

    const tile = doc.querySelector('[data-date="2026-08-08"]');
    tile.click();

    const rows = doc.querySelectorAll('#day-drawer .metric-row');
    const labels = Array.from(rows).map(r => r.querySelector('span').textContent);
    expect(labels).not.toContain('Effective Distance');

    const syncedRow = rows && Array.from(rows).find(r => r.querySelector('span').textContent === 'Synced (Google Fit)');
    expect(syncedRow.querySelector('.value').textContent).toBe('4800');
  });

  it('zero-state drawer has no Effective Distance row', async () => {
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

    doc.querySelector('[data-date="2026-08-15"]').click();

    const labels = Array.from(doc.querySelectorAll('#day-drawer .metric-row span'))
      .map(el => el.textContent);
    expect(labels).not.toContain('Effective Distance');
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

  it('drawer has no Verified Manual or Override note rows', async () => {
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

    const drawer = doc.getElementById('day-drawer');
    const labels = Array.from(drawer.querySelectorAll('.metric-row span')).map(el => el.textContent);
    expect(labels).not.toContain('Verified Manual');
    expect(labels).not.toContain('Override note');
    expect(drawer.textContent).not.toContain('<img src=x onerror=alert(1)>');
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

function makeSamplePayloadWithProof(proofBase64) {
  return makeSamplePayloadWithRecord({
    note: 'Existing override with proof',
    proof_image_base64: proofBase64,
    updated_at: '2026-08-05T14:00:00Z',
  });
}

const PROOF_SRC = 'data:image/jpeg;base64,EXISTING_PROOF';

async function openEditForm(doc, payload, records, processImage) {
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
    render,
    stepsInput: drawer.querySelector('input[data-field="effective-steps"]'),
    fileInput: drawer.querySelector('input[data-field="proof-image"]'),
    submitBtn: drawer.querySelector('button[type="submit"]'),
    deleteBtn: drawer.querySelector('[data-action="delete-proof"]'),
    thumbWrap: drawer.querySelector('[data-action="view-proof"]'),
    form: drawer.querySelector('form[data-form="override"]'),
  };
}

async function selectFile(fileInput, processImage, file) {
  const mockFile = file || new File(['test'], 'proof.jpg', { type: 'image/jpeg' });
  Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(processImage).toHaveBeenCalled());
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

  it('Clicking Edit button mounts form with steps and file inputs (no distance, no note)', async () => {
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
    expect(distInput).toBeNull();
    expect(noteTextarea).toBeNull();
    expect(fileInput).not.toBeNull();
    expect(fileInput.accept).toBe('image/png,image/jpeg,image/webp');
  });

  it('Form pre-populates with current effective_steps for overridden day', async () => {
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
    expect(distInput).toBeNull();
    expect(noteTextarea).toBeNull();
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
  it('Save button is disabled until a proof image is uploaded', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { submitBtn } = await openEditForm(doc, payload, records, processImage);

    expect(submitBtn.disabled).toBe(true);
  });

  it('Submitting without a proof image does NOT call overrideRecord', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { form, stepsInput } = await openEditForm(doc, payload, records, processImage);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    stepsInput.value = '7000';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 50));
    expect(processImage).not.toHaveBeenCalled();
    expect(records.overrideRecord).not.toHaveBeenCalled();
    expect(events.length).toBe(0);
  });

  it('Selecting a file calls processImage then enables Save; submit passes the processed base64', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const records = makeMockRecords();
    const processImage = vi.fn().mockResolvedValue('data:image/jpeg;base64,PROCESSED');
    const { form, fileInput, submitBtn, stepsInput } = await openEditForm(doc, payload, records, processImage);

    const mockFile = new File(['test'], 'proof.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(processImage).toHaveBeenCalledWith(mockFile));
    await vi.waitFor(() => expect(submitBtn.disabled).toBe(false));

    stepsInput.value = '7500';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(records.overrideRecord).toHaveBeenCalled());
    const callArgs = records.overrideRecord.mock.calls[0];
    expect(callArgs[0]).toBe('2026-08-05');
    expect(callArgs[1].effective_steps).toBe(7500);
    expect(callArgs[1].note).toBeUndefined();
    expect(callArgs[1].proof_image_base64).toBe('data:image/jpeg;base64,PROCESSED');
    expect(callArgs[1].effective_distance_km).toBeUndefined();
  });

  it('Editing a day with a saved proof reuses it: Save enabled on mount, no processImage call, submit passes existing base64', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithProof(PROOF_SRC);
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { submitBtn, form, stepsInput } = await openEditForm(doc, payload, records, processImage);

    expect(submitBtn.disabled).toBe(false);

    stepsInput.value = '6100';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(records.overrideRecord).toHaveBeenCalled());
    expect(processImage).not.toHaveBeenCalled();
    expect(records.overrideRecord.mock.calls[0][1].proof_image_base64).toBe(PROOF_SRC);
  });

  it('Delete removes the saved proof → Save disabled until a new image is uploaded', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithProof(PROOF_SRC);
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { form, deleteBtn, submitBtn, fileInput, stepsInput } = await openEditForm(doc, payload, records, processImage);

    deleteBtn.click();
    expect(submitBtn.disabled).toBe(true);
    expect(deleteBtn.hidden).toBe(true);

    stepsInput.value = '6200';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 50));
    expect(records.overrideRecord).not.toHaveBeenCalled();

    // Upload a replacement → Save re-enables
    const mockFile = new File(['test'], 'new.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(processImage).toHaveBeenCalled());
    await vi.waitFor(() => expect(submitBtn.disabled).toBe(false));
  });

  it('Delete of a fresh selection → Save disabled', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const records = makeMockRecords();
    const processImage = vi.fn().mockResolvedValue('data:image/jpeg;base64,PROCESSED');
    const { fileInput, deleteBtn, submitBtn } = await openEditForm(doc, payload, records, processImage);

    const mockFile = new File(['test'], 'proof.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(submitBtn.disabled).toBe(false));

    deleteBtn.click();
    expect(submitBtn.disabled).toBe(true);
    expect(deleteBtn.hidden).toBe(true);
  });

  it('While processing, Save is disabled and shows "Processing…"; re-enabled on success', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const records = makeMockRecords();
    let resolveProcessing;
    const processImage = vi.fn().mockReturnValue(new Promise((resolve) => { resolveProcessing = resolve; }));
    const { fileInput, submitBtn } = await openEditForm(doc, payload, records, processImage);

    const mockFile = new File(['test'], 'proof.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(processImage).toHaveBeenCalled());
    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.textContent).toBe('Processing\u2026');

    resolveProcessing('data:image/jpeg;base64,DONE');
    await vi.waitFor(() => expect(submitBtn.disabled).toBe(false));
    expect(submitBtn.textContent).toBe('Save Override');
  });

  it('processImage rejection → ❌ reporter, Save stays disabled, overrideRecord NOT called, no event', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const records = makeMockRecords();
    const processImage = vi.fn().mockRejectedValue(new Error('Bad image'));
    const { fileInput, submitBtn, reporter } = await openEditForm(doc, payload, records, processImage);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const mockFile = new File(['test'], 'bad.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(reporter.db).toHaveBeenCalled());
    expect(reporter.db).toHaveBeenCalledWith(expect.stringContaining('❌'));
    expect(consoleErrorSpy).toHaveBeenCalledWith('[override-form]', expect.any(Error));
    expect(submitBtn.disabled).toBe(true);
    expect(records.overrideRecord).not.toHaveBeenCalled();
    expect(events.length).toBe(0);
  });

  it('processImage rejection while replacing an existing proof keeps the existing proof', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithProof(PROOF_SRC);
    const records = makeMockRecords();
    const processImage = vi.fn().mockRejectedValue(new Error('Bad image'));
    const { fileInput, submitBtn, reporter } = await openEditForm(doc, payload, records, processImage);

    const mockFile = new File(['test'], 'bad.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(reporter.db).toHaveBeenCalled());
    // Existing proof survives the failed replacement → Save remains enabled
    expect(submitBtn.disabled).toBe(false);
  });

  it('Successful override submit dispatches data:records:mutated with { date }', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const records = makeMockRecords();
    const processImage = vi.fn().mockResolvedValue('data:image/jpeg;base64,PROCESSED');
    const { form, fileInput, stepsInput } = await openEditForm(doc, payload, records, processImage);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const mockFile = new File(['test'], 'proof.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(processImage).toHaveBeenCalled());

    stepsInput.value = '8000';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0));
    expect(events[0].detail.date).toBe('2026-08-05');
  });

  it('records.overrideRecord rejection surfaces ❌ reporter; event NOT dispatched', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const records = { overrideRecord: vi.fn().mockRejectedValue(new Error('DB write failed')), revertRecord: vi.fn() };
    const processImage = vi.fn().mockResolvedValue('data:image/jpeg;base64,PROCESSED');
    const { form, fileInput, stepsInput, reporter } = await openEditForm(doc, payload, records, processImage);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const mockFile = new File(['test'], 'proof.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(processImage).toHaveBeenCalled());

    stepsInput.value = '7000';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(reporter.db).toHaveBeenCalled());
    expect(reporter.db).toHaveBeenCalledWith(expect.stringContaining('❌'));
    expect(consoleErrorSpy).toHaveBeenCalledWith('[override-form]', expect.any(Error));
    expect(events.length).toBe(0);
  });

  it('Form listeners under controller.signal; re-render does not stack duplicate handlers', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const records = makeMockRecords();
    const processImage = vi.fn().mockResolvedValue('data:image/jpeg;base64,PROCESSED');
    const { render } = await openEditForm(doc, payload, records, processImage);

    // First render: select file + submit
    let drawer = doc.getElementById('day-drawer');
    drawer.querySelector('input[data-field="effective-steps"]').value = '7000';
    const fileInput1 = drawer.querySelector('input[data-field="proof-image"]');
    const mockFile1 = new File(['test'], 'a.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput1, 'files', { value: [mockFile1], configurable: true });
    fileInput1.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(processImage).toHaveBeenCalledTimes(1));
    drawer.querySelector('form[data-form="override"]')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(records.overrideRecord).toHaveBeenCalledTimes(1));

    // Second render: select file + submit
    records.overrideRecord.mockClear();
    processImage.mockClear();
    await render();
    doc.querySelector('[data-date="2026-08-05"]').click();
    doc.querySelector('[data-action="edit-day"]').click();
    drawer = doc.getElementById('day-drawer');
    drawer.querySelector('input[data-field="effective-steps"]').value = '8000';
    const fileInput2 = drawer.querySelector('input[data-field="proof-image"]');
    const mockFile2 = new File(['test'], 'b.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput2, 'files', { value: [mockFile2], configurable: true });
    fileInput2.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(processImage).toHaveBeenCalledTimes(1));
    drawer.querySelector('form[data-form="override"]')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

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

  it('confirmFn returns true → revertRecord called + data:records:mutated dispatched', async () => {
    const confirmFn = vi.fn().mockReturnValue(true);

    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord({ note: 'Override', proof_image_base64: null, updated_at: '2026-08-05T12:00:00Z' });
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { render } = createCalendarUI(doc, null, engine, reporter, records, processImage, undefined, confirmFn);
    await render();

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    doc.querySelector('[data-date="2026-08-05"]').click();
    const revertBtn = doc.querySelector('[data-action="revert-day"]');
    revertBtn.click();

    await vi.waitFor(() => expect(records.revertRecord).toHaveBeenCalled());
    expect(records.revertRecord).toHaveBeenCalledWith('2026-08-05');
    expect(confirmFn).toHaveBeenCalledWith(expect.stringContaining('revert'));
    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0));
    expect(events[0].detail.date).toBe('2026-08-05');
  });

  it('confirmFn returns false → revertRecord not called; no event dispatched', async () => {
    const confirmFn = vi.fn().mockReturnValue(false);

    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord({ note: 'Override', proof_image_base64: null, updated_at: '2026-08-05T12:00:00Z' });
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { render } = createCalendarUI(doc, null, engine, reporter, records, processImage, undefined, confirmFn);
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
    const confirmFn = vi.fn().mockReturnValue(true);
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
    const { render } = createCalendarUI(doc, null, engine, reporter, records, processImage, undefined, confirmFn);
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
// Proof thumbnail & full-size lightbox
// ---------------------------------------------------------------------------

describe('Proof thumbnail & lightbox', () => {
  it('form shows a thumbnail of the uploaded image with the processed base64 src', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const records = makeMockRecords();
    const processImage = vi.fn().mockResolvedValue('data:image/jpeg;base64,PROCESSED');
    const { fileInput, thumbWrap } = await openEditForm(doc, payload, records, processImage);

    expect(thumbWrap.hidden).toBe(true);

    const mockFile = new File(['test'], 'proof.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(thumbWrap.hidden).toBe(false));
    const thumb = thumbWrap.querySelector('.proof-thumb');
    expect(thumb).not.toBeNull();
    expect(thumb.src).toBe('data:image/jpeg;base64,PROCESSED');
  });

  it('form shows thumbnail of the existing saved proof when re-editing', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithProof(PROOF_SRC);
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { thumbWrap } = await openEditForm(doc, payload, records, processImage);

    expect(thumbWrap.hidden).toBe(false);
    expect(thumbWrap.querySelector('.proof-thumb').src).toBe(PROOF_SRC);
  });

  it('clicking the form thumbnail opens the lightbox; close button dismisses it', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord();
    const records = makeMockRecords();
    const processImage = vi.fn().mockResolvedValue('data:image/jpeg;base64,PROCESSED');
    const { fileInput, thumbWrap } = await openEditForm(doc, payload, records, processImage);

    const mockFile = new File(['test'], 'proof.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(thumbWrap.hidden).toBe(false));

    thumbWrap.click();

    const lightbox = doc.querySelector('.proof-lightbox');
    expect(lightbox).not.toBeNull();
    expect(lightbox.querySelector('img').src).toBe('data:image/jpeg;base64,PROCESSED');

    lightbox.querySelector('.proof-lightbox__close').click();
    expect(doc.querySelector('.proof-lightbox')).toBeNull();
  });

  it('lightbox closes on overlay click and on Escape', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithProof(PROOF_SRC);
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { thumbWrap } = await openEditForm(doc, payload, records, processImage);

    thumbWrap.click();
    const lightbox = doc.querySelector('.proof-lightbox');
    expect(lightbox).not.toBeNull();

    // Escape closes
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(doc.querySelector('.proof-lightbox')).toBeNull();

    // Re-open, overlay click closes
    thumbWrap.click();
    const lightbox2 = doc.querySelector('.proof-lightbox');
    lightbox2.click();
    expect(doc.querySelector('.proof-lightbox')).toBeNull();
  });

  it('read-only drawer shows a clickable thumbnail for a day with a saved proof', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithProof(PROOF_SRC);
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { render } = createCalendarUI(doc, null, engine, reporter, records, processImage);
    await render();

    doc.querySelector('[data-date="2026-08-05"]').click();

    const drawer = doc.getElementById('day-drawer');
    const thumbWrap = drawer.querySelector('.proof-thumb-wrap');
    expect(thumbWrap).not.toBeNull();
    expect(thumbWrap.querySelector('.proof-thumb').src).toBe(PROOF_SRC);

    thumbWrap.click();
    expect(doc.querySelector('.proof-lightbox')).not.toBeNull();
    expect(doc.querySelector('.proof-lightbox img').src).toBe(PROOF_SRC);
  });

  it('read-only drawer shows no thumbnail when the override has no proof', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithRecord({ note: 'No proof here', proof_image_base64: null, updated_at: '2026-08-05T12:00:00Z' });
    const engine = makeMockEngine(payload);
    const reporter = makeMockReporter();
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { render } = createCalendarUI(doc, null, engine, reporter, records, processImage);
    await render();

    doc.querySelector('[data-date="2026-08-05"]').click();

    expect(doc.getElementById('day-drawer').querySelector('.proof-thumb-wrap')).toBeNull();
  });

  it('closing the drawer also closes an open lightbox', async () => {
    const doc = buildDoc(getBaseHTML());
    const payload = makeSamplePayloadWithProof(PROOF_SRC);
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { thumbWrap } = await openEditForm(doc, payload, records, processImage);

    thumbWrap.click();
    expect(doc.querySelector('.proof-lightbox')).not.toBeNull();

    doc.querySelector('.close-btn').click();
    expect(doc.querySelector('.proof-lightbox')).toBeNull();
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
      fileInput: drawer.querySelector('input[type="file"]'),
      submitBtn: drawer.querySelector('button[type="submit"]'),
      form: drawer.querySelector('form[data-form="override"]'),
    };
  }

  async function attachValidProof(fileInput, processImage) {
    const mockFile = new File(['test'], 'proof.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(processImage).toHaveBeenCalled());
  }

  it('empty steps (NaN) → overrideRecord NOT called; no data:records:mutated event', async () => {
    const doc = buildDoc(getBaseHTML());
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { form, fileInput, stepsInput } = await openFormForDay(doc, records, processImage);
    await attachValidProof(fileInput, processImage);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    stepsInput.value = '';       // parseInt('') → NaN
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 50));
    expect(records.overrideRecord).not.toHaveBeenCalled();
    expect(events.length).toBe(0);
  });

  it('non-integer steps (float text) → overrideRecord NOT called', async () => {
    const doc = buildDoc(getBaseHTML());
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { form, fileInput, stepsInput } = await openFormForDay(doc, records, processImage);
    await attachValidProof(fileInput, processImage);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    stepsInput.value = '3.5';    // parseInt gives 3, but Number.isInteger(parseFloat('3.5')) is false
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 50));
    expect(records.overrideRecord).not.toHaveBeenCalled();
    expect(events.length).toBe(0);
  });

  it('negative steps → overrideRecord NOT called', async () => {
    const doc = buildDoc(getBaseHTML());
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { form, fileInput, stepsInput } = await openFormForDay(doc, records, processImage);
    await attachValidProof(fileInput, processImage);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    stepsInput.value = '-1';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 50));
    expect(records.overrideRecord).not.toHaveBeenCalled();
    expect(events.length).toBe(0);
  });

  it('invalid steps → overrideRecord NOT called even after a valid proof is uploaded', async () => {
    const doc = buildDoc(getBaseHTML());
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { form, fileInput, stepsInput } = await openFormForDay(doc, records, processImage);
    await attachValidProof(fileInput, processImage);

    stepsInput.value = '';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 50));
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
    const form = drawer.querySelector('form[data-form="override"]');

    stepsInput.value = '';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 50));
    expect(reporter.db).not.toHaveBeenCalled();
  });

  it('valid input (steps=0, proof uploaded) → overrideRecord IS called', async () => {
    const doc = buildDoc(getBaseHTML());
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { form, fileInput, stepsInput } = await openFormForDay(doc, records, processImage);
    await attachValidProof(fileInput, processImage);

    stepsInput.value = '0';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(records.overrideRecord).toHaveBeenCalled());
    expect(records.overrideRecord.mock.calls[0][1].effective_steps).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Task 11 (ST-007a) — activeGoalKm must not appear in any src/** file
// ---------------------------------------------------------------------------

describe('Task 11 (ST-007a) — activeGoalKm removed from src/**', () => {
  it('no src/**/*.js file contains the string "activeGoalKm"', () => {
    const srcDir = path.resolve(__dirname);
    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(full);
        } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
          const source = fs.readFileSync(full, 'utf8');
          expect(source, `${full} contains activeGoalKm`).not.toContain('activeGoalKm');
        }
      }
    }
    scanDir(srcDir);
  });
});
