/**
 * Tests for src/month-overview.js — dashboard current-month heatmap card.
 * Mirrors calendar-ui.test.js style: injected doc, mocked calendar engine, no Dexie.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createMonthOverview } from './month-overview.js';
import {
  buildMonthGrid,
  classifyDay,
  computeMonthlyAggregates,
  CLASSIFICATION_MET,
  CLASSIFICATION_EXCEEDED,
  CLASSIFICATION_MISSED,
} from './calendar.js';

// ── Test window ──────────────────────────────────────────────────────────────
// The dashboard card is pinned to the *current* month. Tests fix the clock to
// August 2026 so grid fixtures and expectations are deterministic.
const NOW = new Date(2026, 7, 11); // 2026-08-11 local
const TODAY = '2026-08-11';

function setFakeNow() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal jsdom document containing the dashboard month slot.
 */
function buildDoc() {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML =
    '<div id="tab-dashboard"><div id="dashboard-month"></div></div>';
  return doc;
}

/**
 * Build a mock calendar engine around a real month payload.
 * @param {object} payload - loadMonth resolve value
 */
function makeEngine(payload, shouldReject = false) {
  return {
    loadMonth: shouldReject
      ? vi.fn().mockRejectedValue(payload)
      : vi.fn().mockResolvedValue(payload),
    buildZeroState: vi.fn((year, month) => {
      const grid = buildMonthGrid(year, month, TODAY);
      const days = grid.days.map((day) => ({
        ...day,
        record: null,
        targetDistanceKm: 5,
        classification: { state: 0, isOverridden: false },
      }));
      return {
        ...grid,
        today: TODAY,
        days,
        aggregates: computeMonthlyAggregates(days),
        navBounds: {},
      };
    }),
  };
}

/**
 * Enrich a buildMonthGrid output into a full loadMonth payload.
 * @param {{records: Array<{date: string, effective_steps: number, effective_distance_km: number, is_overridden?: boolean}>}} opts
 */
function monthPayload({ records = [] } = {}) {
  const grid = buildMonthGrid(2026, 7, TODAY);
  const recordMap = new Map(records.map((r) => [r.date, r]));
  const days = grid.days.map((day) => {
    const record = recordMap.get(day.date) || null;
    const classification = classifyDay(record, 5, day.isFuture);
    return { ...day, record, targetDistanceKm: 5, classification };
  });
  return {
    ...grid,
    today: TODAY,
    days,
    aggregates: computeMonthlyAggregates(days),
    navBounds: {},
  };
}

const MET_RECORD = { date: '2026-08-01', effective_steps: 7200, effective_distance_km: 5.4 };
const EXCEEDED_RECORD = { date: '2026-08-04', effective_steps: 12100, effective_distance_km: 10.5 };
const MISSED_RECORD = { date: '2026-08-02', effective_steps: 2100, effective_distance_km: 1.6 };
const OVERRIDDEN_RECORD = {
  date: '2026-08-07',
  effective_steps: 9400,
  effective_distance_km: 7.1,
  is_overridden: true,
};

// ── Tests ────────────────────────────────────────────────────────────────────

afterEach(() => vi.useRealTimers());

describe('createMonthOverview', () => {
  // ── Factory / signature ─────────────────────────────────────────────────
  describe('factory signature', () => {
    it('accepts (doc, calendarEngine, reporter) and returns { render }', () => {
      const doc = buildDoc();
      const engine = makeEngine(monthPayload());
      const ui = createMonthOverview(doc, engine, { db: vi.fn() });
      expect(typeof ui.render).toBe('function');
    });

    it('render() returns a Promise', () => {
      const doc = buildDoc();
      const engine = makeEngine(monthPayload());
      const ui = createMonthOverview(doc, engine, { db: vi.fn() });
      const result = ui.render();
      expect(result).toBeInstanceOf(Promise);
      return result;
    });
  });

  // ── Missing container ───────────────────────────────────────────────────
  describe('missing container', () => {
    it('logs console.warn and does not throw when neither #dashboard-month nor #tab-dashboard exist', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const doc = document.implementation.createHTMLDocument('test');
      const engine = makeEngine(monthPayload());
      const ui = createMonthOverview(doc, engine, { db: vi.fn() });
      await expect(ui.render()).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith('[month-overview]', expect.any(String));
    });

    it('does not inject a card when no container exists', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const doc = document.implementation.createHTMLDocument('test');
      const engine = makeEngine(monthPayload());
      const ui = createMonthOverview(doc, engine, { db: vi.fn() });
      await ui.render();
      expect(doc.getElementById('month-overview-card')).toBeNull();
    });
  });

  // ── Card anatomy ────────────────────────────────────────────────────────
  describe('card anatomy', () => {
    beforeEach(setFakeNow);

    it('injects #month-overview-card into #dashboard-month', async () => {
      const doc = buildDoc();
      const ui = createMonthOverview(doc, makeEngine(monthPayload()), { db: vi.fn() });
      await ui.render();
      const slot = doc.getElementById('dashboard-month');
      const card = doc.getElementById('month-overview-card');
      expect(card).not.toBeNull();
      expect(slot.contains(card)).toBe(true);
    });

    it('renders the current month caption in the card title', async () => {
      const doc = buildDoc();
      const ui = createMonthOverview(doc, makeEngine(monthPayload()), { db: vi.fn() });
      await ui.render();
      const card = doc.getElementById('month-overview-card');
      expect(card.innerHTML).toContain('August 2026');
    });

    it('renders commitment hit rate across elapsed days, excluding today', async () => {
      const payload = monthPayload({ records: [MET_RECORD] });
      const doc = buildDoc();
      const ui = createMonthOverview(doc, makeEngine(payload), { db: vi.fn() });
      await ui.render();
      const hit = doc.querySelector('.month-hit-rate');
      expect(hit).not.toBeNull();
      expect(hit.textContent).toContain('10%');
    });

    it('uses the selected active goal instead of each day historical target', async () => {
      const payload = monthPayload({ records: [MET_RECORD] });
      payload.activeGoalKm = 10;
      const doc = buildDoc();
      const ui = createMonthOverview(doc, makeEngine(payload), { db: vi.fn() });
      await ui.render();
      expect(doc.querySelector('.month-hit-rate').textContent).toBe('Hit Rate: 0%');
    });

    it('renders zero hit rate when elapsed days have no records', async () => {
      const doc = buildDoc();
      const engine = makeEngine(monthPayload());
      const ui = createMonthOverview(doc, engine, { db: vi.fn() });
      await ui.render();
      const hit = doc.querySelector('.month-hit-rate');
      expect(hit.textContent).toBe('Hit Rate: 0%');
    });

    it('renders the 7-day weekday header row', async () => {
      const doc = buildDoc();
      const ui = createMonthOverview(doc, makeEngine(monthPayload()), { db: vi.fn() });
      await ui.render();
      const weekdays = Array.from(doc.querySelectorAll('.heatmap-weekday')).map((c) => c.textContent);
      expect(weekdays).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    });

    it('renders a tile for every calendar day (plus leading/trailing pads)', async () => {
      const payload = monthPayload();
      const doc = buildDoc();
      const ui = createMonthOverview(doc, makeEngine(payload), { db: vi.fn() });
      await ui.render();
      const tileCount = doc.querySelectorAll('.heatmap-tile').length;
      const dayCount = doc.querySelectorAll('.heatmap-tile:not(.heatmap-tile--pad)').length;
      expect(dayCount).toBe(payload.days.length);
      expect(tileCount).toBe(payload.leadingPad + payload.days.length + payload.trailingPad);
    });

    it('no onclick= attributes are injected', async () => {
      const doc = buildDoc();
      const ui = createMonthOverview(doc, makeEngine(monthPayload()), { db: vi.fn() });
      await ui.render();
      const card = doc.getElementById('month-overview-card');
      expect(card.innerHTML).not.toMatch(/onclick=/);
    });
  });

  // ── Classification classes ──────────────────────────────────────────────
  describe('tile classification', () => {
    beforeEach(setFakeNow);

    it('met day gets .heatmap-tile--met and a compact steps label', async () => {
      const payload = monthPayload({ records: [MET_RECORD] });
      const doc = buildDoc();
      const ui = createMonthOverview(doc, makeEngine(payload), { db: vi.fn() });
      await ui.render();
      const tile = doc.querySelector(`[data-date="2026-08-01"]`);
      expect(tile.classList.contains('heatmap-tile--met')).toBe(true);
      expect(tile.querySelector('.heatmap-steps').textContent).toBe('7.2k');
    });

    it('exceeded day gets .heatmap-tile--exceeded', async () => {
      const payload = monthPayload({ records: [EXCEEDED_RECORD] });
      const doc = buildDoc();
      const ui = createMonthOverview(doc, makeEngine(payload), { db: vi.fn() });
      await ui.render();
      const tile = doc.querySelector('[data-date="2026-08-04"]');
      expect(tile.classList.contains('heatmap-tile--exceeded')).toBe(true);
      expect(tile.querySelector('.heatmap-steps').textContent).toBe('12.1k');
    });

    it('missed day gets .heatmap-tile--missed', async () => {
      const payload = monthPayload({ records: [MISSED_RECORD] });
      const doc = buildDoc();
      const ui = createMonthOverview(doc, makeEngine(payload), { db: vi.fn() });
      await ui.render();
      const tile = doc.querySelector('[data-date="2026-08-02"]');
      expect(tile.classList.contains('heatmap-tile--missed')).toBe(true);
    });

    it('overridden day gets .heatmap-tile--overridden and a * badge', async () => {
      const payload = monthPayload({ records: [OVERRIDDEN_RECORD] });
      const doc = buildDoc();
      const ui = createMonthOverview(doc, makeEngine(payload), { db: vi.fn() });
      await ui.render();
      const tile = doc.querySelector('[data-date="2026-08-07"]');
      expect(tile.classList.contains('heatmap-tile--overridden')).toBe(true);
      const badge = tile.querySelector('.heatmap-tile__override');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe('*');
    });

    it('today tile gets .heatmap-tile--today and a Today label', async () => {
      const payload = monthPayload({ records: [MET_RECORD] });
      const doc = buildDoc();
      const ui = createMonthOverview(doc, makeEngine(payload), { db: vi.fn() });
      await ui.render();
      const tile = doc.querySelector('[data-date="2026-08-11"]');
      expect(tile.classList.contains('heatmap-tile--today')).toBe(true);
      expect(tile.querySelector('.heatmap-steps').textContent).toBe('Today');
    });

    it('future tiles get .heatmap-tile--future and no steps label', async () => {
      const doc = buildDoc();
      const ui = createMonthOverview(doc, makeEngine(monthPayload()), { db: vi.fn() });
      await ui.render();
      const tile = doc.querySelector('[data-date="2026-08-31"]');
      expect(tile.classList.contains('heatmap-tile--future')).toBe(true);
      expect(tile.querySelector('.heatmap-steps')).toBeNull();
    });

    it('steps under 1000 render as the raw integer', async () => {
      const payload = monthPayload({
        records: [{ date: '2026-08-03', effective_steps: 540, effective_distance_km: 0.4 }],
      });
      const doc = buildDoc();
      const ui = createMonthOverview(doc, makeEngine(payload), { db: vi.fn() });
      await ui.render();
      const tile = doc.querySelector('[data-date="2026-08-03"]');
      expect(tile.querySelector('.heatmap-steps').textContent).toBe('540');
    });
  });

  // ── Current-month pinning ───────────────────────────────────────────────
  describe('current-month pinning', () => {
    it('loads only the current local month', async () => {
      setFakeNow();
      const engine = makeEngine(monthPayload());
      const ui = createMonthOverview(buildDoc(), engine, { db: vi.fn() });
      await ui.render();
      expect(engine.loadMonth).toHaveBeenCalledTimes(1);
      expect(engine.loadMonth).toHaveBeenCalledWith(2026, 7);
    });
  });

  // ── Idempotent re-render ────────────────────────────────────────────────
  describe('idempotent re-render', () => {
    it('two render() calls produce exactly one #month-overview-card', async () => {
      setFakeNow();
      const doc = buildDoc();
      const ui = createMonthOverview(doc, makeEngine(monthPayload()), { db: vi.fn() });
      await ui.render();
      await ui.render();
      expect(doc.querySelectorAll('#month-overview-card').length).toBe(1);
    });
  });

  // ── Fail-open: loadMonth rejects ────────────────────────────────────────
  describe('fail-open: loadMonth rejects', () => {
    it('reports via reporter.db and still renders a zero-state card', async () => {
      setFakeNow();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const doc = buildDoc();
      const reporter = { db: vi.fn() };
      const ui = createMonthOverview(doc, makeEngine(new Error('DB error'), true), reporter);
      await expect(ui.render()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith('[month-overview]', expect.any(Error));
      expect(reporter.db).toHaveBeenCalledWith(expect.stringContaining('❌'));
      expect(doc.getElementById('month-overview-card')).not.toBeNull();
    });

    it('zero-state card renders zero hit rate for elapsed days', async () => {
      setFakeNow();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const doc = buildDoc();
      const ui = createMonthOverview(doc, makeEngine(new Error('DB error'), true), { db: vi.fn() });
      await ui.render();
      const hit = doc.querySelector('.month-hit-rate');
      expect(hit.textContent).toBe('Hit Rate: 0%');
    });
  });

  // ── Hint ────────────────────────────────────────────────────────────────
  describe('history hint', () => {
    it('mentions the Calendar tab for historical months', async () => {
      setFakeNow();
      const doc = buildDoc();
      const ui = createMonthOverview(doc, makeEngine(monthPayload()), { db: vi.fn() });
      await ui.render();
      const hint = doc.querySelector('.month-overview-hint');
      expect(hint).not.toBeNull();
      expect(hint.textContent).toContain('Calendar');
    });
  });

  // ── Boundary contract ───────────────────────────────────────────────────
  describe('boundary contract', () => {
    it('loadMonth is the only engine method consumed on success', async () => {
      setFakeNow();
      const engine = makeEngine(monthPayload());
      const ui = createMonthOverview(buildDoc(), engine, { db: vi.fn() });
      await ui.render();
      expect(engine.loadMonth).toHaveBeenCalledTimes(1);
      expect(engine.buildZeroState).not.toHaveBeenCalled();
    });

    it('buildZeroState is consumed only on loadMonth rejection', async () => {
      setFakeNow();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const engine = makeEngine(new Error('DB error'), true);
      const ui = createMonthOverview(buildDoc(), engine, { db: vi.fn() });
      await ui.render();
      expect(engine.buildZeroState).toHaveBeenCalledTimes(1);
    });
  });
});

// Sanity: classification constants used by fixtures are distinct.
describe('month-overview fixture sanity', () => {
  it('classification constants are distinct', () => {
    expect(CLASSIFICATION_MET).toBe(2);
    expect(CLASSIFICATION_EXCEEDED).toBe(3);
    expect(CLASSIFICATION_MISSED).toBe(1);
  });
});
