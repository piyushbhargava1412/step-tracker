import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  createStepSync,
  CHUNK_DAYS,
  BUCKET_MS,
  SAFETY_BUFFER_DAYS,
  STEP_TO_KM,
  BACKFILL_COMPLETE_KEY,
  DEFAULT_SYNC_ANCHOR,
  PHASE_FULL_HISTORY,
  PHASE_INCREMENTAL,
  _localMidnight,
  _addDays,
  _formatLocalDate,
  _chunkWindow,
  _determineSyncWindows,
  _toDailyRecords,
  _upsertChunk,
  _effectiveHighWater,
  _latchBackfillComplete,
  _readOldestStoredLabel,
} from './steps.js';
import {
  SYNC_ERROR_NAME,
  FAILURE_AUTH_EXPIRED,
  FAILURE_HTTP_ERROR,
  FAILURE_RETRY_EXHAUSTED,
  FAILURE_NETWORK_ERROR,
  FAILURE_SOURCE_ERROR,
  syncFailure,
} from './step-source.js';
import {
  createFitStepSource,
  HOURLY_BUCKET_MS,
  RETRY_BACKOFF_MS,
} from './fit-step-source.js';
import { DB_VERSION } from './db.js';
import { createBackup } from './backup.js';
import {
  makeStatefulDb,
  makeScriptedDb,
  seedRow,
  syncBtn,
  lastSyncMessage as lastSyncMessageFor,
} from './steps.fixtures.js';

describe('Task 2: src/steps.js scaffold — constants and DST-safe local-date helpers', () => {
  let auth, db, reporter, doc;

  beforeEach(() => {
    auth = { getAccessToken: vi.fn().mockReturnValue('tok-abc') };
    db = {
      daily_records: {
        orderBy: vi.fn(),
        first: vi.fn(),
        last: vi.fn(),
        bulkGet: vi.fn(),
        bulkPut: vi.fn(),
      },
      settings: { get: vi.fn(), put: vi.fn() },
      transaction: vi.fn(),
    };
    reporter = { db: vi.fn(), auth: vi.fn(), sync: vi.fn() };
    doc = document;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── Factory shape ──────────────────────────────────────────────────────────

  describe('createStepSync factory', () => {
    it('returns a plain object (not a class instance) with a sync method', () => {
      const result = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc);
      expect(typeof result.sync).toBe('function');
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    });

    it('three-arg call — doc defaults to document without error', () => {
      expect(() => createStepSync(createFitStepSource(auth, reporter), db, reporter)).not.toThrow();
      const result = createStepSync(createFitStepSource(auth, reporter), db, reporter);
      expect(typeof result.sync).toBe('function');
    });

    it('fails fast when the first argument is not a StepSource (e.g. a legacy auth object)', () => {
      expect(() => createStepSync(auth, db, reporter, doc)).toThrow(/StepSource/);
      expect(() => createStepSync(null, db, reporter, doc)).toThrow(TypeError);
    });

    it('isSyncing flag is closure-scoped and not exposed on the returned object', () => {
      const result = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc);
      expect(result.isSyncing).toBeUndefined();
    });
  });

  // ── Decision-11 constants ──────────────────────────────────────────────────

  describe('Decision-11 constants', () => {
    it('no hardcoded 2013 history anchor remains — the configured sync anchor is the only floor', () => {
      const stepsContent = fs.readFileSync(path.resolve(__dirname, './steps.js'), 'utf-8');
      expect(stepsContent).not.toContain('HISTORY_ANCHOR_DATE');
      expect(stepsContent).not.toContain('2013');
    });


    it('TOTAL_DAYS does not appear anywhere in src/steps.js', () => {
      const stepsContent = fs.readFileSync(
        path.resolve(__dirname, './steps.js'),
        'utf-8'
      );
      expect(stepsContent).not.toContain('TOTAL_DAYS');
    });
  });

  // ── _localMidnight ─────────────────────────────────────────────────────────

  describe('_localMidnight', () => {
    it('accepts a Date and returns a new Date at 00:00:00.000 local time', () => {
      const input = new Date(2025, 2, 15, 14, 30, 45, 500);
      const result = _localMidnight(input);
      expect(result.getDate()).toBe(15);
      expect(result.getMonth()).toBe(2);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    it('accepts a millisecond timestamp and returns a Date at local midnight', () => {
      const ts = new Date(2025, 2, 15, 14, 30, 45, 500).getTime();
      const result = _localMidnight(ts);
      expect(result).toBeInstanceOf(Date);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    it('does not mutate the original Date argument', () => {
      const input = new Date(2025, 2, 15, 14, 30, 45, 500);
      const originalTime = input.getTime();
      _localMidnight(input);
      expect(input.getTime()).toBe(originalTime);
    });
  });

  // ── _addDays ───────────────────────────────────────────────────────────────

  describe('_addDays', () => {
    it('adds a positive number of days and returns a Date at local midnight', () => {
      const start = new Date(2025, 2, 8, 14, 30, 0, 0); // March 8, 14:30 local
      const result = _addDays(start, 1);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(2);
      expect(result.getDate()).toBe(9);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    it('subtracts days when n is negative', () => {
      const start = new Date(2025, 2, 15, 0, 0, 0, 0); // March 15
      const result = _addDays(start, -3);
      expect(result.getDate()).toBe(12);
      expect(result.getMonth()).toBe(2);
      expect(result.getHours()).toBe(0);
    });

    it('lands on 00:00:00.000 across spring-forward DST boundary (calendar-day stepping)', () => {
      // March 9, 2025 is spring-forward in America/New_York.
      // Pure ms arithmetic (+ 24 * 3600 * 1000) would land at 01:00 in that TZ.
      // Calendar stepping via setDate + setHours(0,0,0,0) always produces local midnight.
      const march8midnight = new Date(2025, 2, 8, 0, 0, 0, 0);
      const result = _addDays(march8midnight, 1);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    it('does not mutate the original Date argument', () => {
      const start = new Date(2025, 2, 15, 0, 0, 0, 0);
      const originalTime = start.getTime();
      _addDays(start, 5);
      expect(start.getTime()).toBe(originalTime);
    });
  });

  // ── _formatLocalDate ───────────────────────────────────────────────────────

  describe('_formatLocalDate', () => {
    it('returns a YYYY-MM-DD string using local date getters', () => {
      // new Date(year, month, day) uses LOCAL timezone → result is always local date
      const ts = new Date(2025, 5, 15, 10, 30, 0).getTime(); // June 15, 2025 10:30 local
      expect(_formatLocalDate(ts)).toBe('2025-06-15');
    });

    it('pads single-digit month and day with leading zeros', () => {
      const ts = new Date(2025, 0, 5, 0, 0, 0).getTime(); // Jan 5, 2025 local midnight
      expect(_formatLocalDate(ts)).toBe('2025-01-05');
    });

    it('uses local getters — result matches manually computed local YYYY-MM-DD string', () => {
      vi.useFakeTimers();
      // 2025-03-01T19:00:00Z: in UTC+5:30 (IST) this is 00:30 on March 2.
      // In UTC this is 19:00 on March 1. Either way, _formatLocalDate must match local getters.
      const ts = new Date('2025-03-01T19:00:00Z').getTime();
      vi.setSystemTime(ts);

      const result = _formatLocalDate(ts);

      // Compute expected from local date getters — timezone-agnostic assertion
      const d = new Date(ts);
      const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      expect(result).toBe(expected);
    });
  });

  // ── Regression ─────────────────────────────────────────────────────────────

  describe('Regression', () => {
    it('src/steps.js imports no other src/ module', () => {
      const stepsContent = fs.readFileSync(
        path.resolve(__dirname, './steps.js'),
        'utf-8'
      );
      const srcModules = ['./auth', './db', './ui-status', './storage', './main', './tabs'];
      for (const mod of srcModules) {
        expect(stepsContent).not.toContain(`from '${mod}'`);
        expect(stepsContent).not.toContain(`from "${mod}"`);
      }
    });
  });
});

// ── Task 3: _chunkWindow — newest-first calendar chunker ─────────────────────

describe('Task 3: _chunkWindow — newest-first calendar chunker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('a 30-day window yields exactly 1 chunk', () => {
    // Jan 1 → Jan 31, 2025: span = 30 days → ceil(30 / 30) = 1 chunk
    const startDate = new Date(2025, 0, 1);
    const endDate = new Date(2025, 0, 31);
    const chunks = _chunkWindow(startDate, endDate);
    expect(chunks.length).toBe(1);
  });

  it('a 60-day window yields exactly 2 chunks', () => {
    // Jan 1 → Mar 2, 2025: Jan(31) + Feb(28) + Mar 1 day = 60 days → ceil(60 / 30) = 2 chunks
    const startDate = new Date(2025, 0, 1);
    const endDate = new Date(2025, 2, 2);
    const chunks = _chunkWindow(startDate, endDate);
    expect(chunks.length).toBe(2);
  });

  it('a 31-day window yields 2 chunks; the older chunk has a shorter span than 30 days', () => {
    // Jan 1 → Feb 1, 2025: January = 31 days → 2 chunks, last chunk is 1 day (clamped)
    const startDate = new Date(2025, 0, 1);
    const endDate = new Date(2025, 1, 1);
    const chunks = _chunkWindow(startDate, endDate);
    expect(chunks.length).toBe(2);
    const olderChunk = chunks[chunks.length - 1];
    expect(olderChunk.endMs - olderChunk.startMs).toBeLessThan(CHUNK_DAYS * BUCKET_MS);
  });

  it('a 1-day window yields exactly 1 chunk', () => {
    const startDate = new Date(2025, 0, 1);
    const endDate = new Date(2025, 0, 2);
    const chunks = _chunkWindow(startDate, endDate);
    expect(chunks.length).toBe(1);
  });

  it('an exact 90-day window yields 3 chunks (exact multiple of 30)', () => {
    // Jan 1 → Apr 1, 2025: Jan(31) + Feb(28) + Mar(31) = 90 days → ceil(90 / 30) = 3 chunks
    const startDate = new Date(2025, 0, 1);
    const endDate = new Date(2025, 3, 1);
    const spanDays = (endDate.getTime() - startDate.getTime()) / BUCKET_MS;
    const chunks = _chunkWindow(startDate, endDate);
    expect(chunks.length).toBe(Math.ceil(spanDays / CHUNK_DAYS));
    expect(chunks.length).toBe(3);
  });

  it('chunks are ordered newest-first — startMs values are monotonically decreasing', () => {
    // 60-day window → 2 chunks
    const startDate = new Date(2025, 0, 1);
    const endDate = new Date(2025, 2, 2);
    const chunks = _chunkWindow(startDate, endDate);
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i].startMs).toBeGreaterThan(chunks[i + 1].startMs);
    }
  });

  it('consecutive chunk boundaries are contiguous — chunks[i].startMs === chunks[i+1].endMs', () => {
    // 60-day window → 2 contiguous chunks with no gap and no overlap
    const startDate = new Date(2025, 0, 1);
    const endDate = new Date(2025, 2, 2);
    const chunks = _chunkWindow(startDate, endDate);
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i].startMs).toBe(chunks[i + 1].endMs);
    }
  });

  it('the first emitted chunk ends exactly at the window end', () => {
    const startDate = new Date(2025, 0, 1);
    const endDate = new Date(2025, 2, 2);
    const endMs = endDate.getTime();
    const chunks = _chunkWindow(startDate, endDate);
    expect(chunks[0].endMs).toBe(endMs);
  });

  it('the last emitted chunk starts exactly at the window start (clamped)', () => {
    // 31-day window: oldest chunk is clamped to startDate
    const startDate = new Date(2025, 0, 1);
    const startMs = startDate.getTime();
    const endDate = new Date(2025, 1, 1);
    const chunks = _chunkWindow(startDate, endDate);
    expect(chunks[chunks.length - 1].startMs).toBe(startMs);
  });

  it('chunk count equals Math.ceil(spanDays / CHUNK_DAYS) for a 45-day window', () => {
    // Jan 1 → Feb 15, 2025: Jan(31) + 14 days of Feb = 45 days → ceil(45 / 30) = 2 chunks
    const startDate = new Date(2025, 0, 1);
    const endDate = new Date(2025, 1, 15);
    const spanDays = (endDate.getTime() - startDate.getTime()) / BUCKET_MS;
    const chunks = _chunkWindow(startDate, endDate);
    expect(chunks.length).toBe(Math.ceil(spanDays / CHUNK_DAYS));
    expect(chunks.length).toBe(2);
  });

  it('every chunk boundary lands on local midnight across a spring-forward DST transition', () => {
    // March 9, 2025 is spring-forward in America/New_York.
    // The 90-day window Jan 1–Apr 1 crosses this boundary.
    // Calendar-day stepping (setDate + setHours(0,0,0,0)) always snaps to local midnight,
    // so getHours() === 0 holds for every boundary regardless of DST transitions.
    const startDate = new Date(2025, 0, 1);
    const endDate = new Date(2025, 3, 1);
    const chunks = _chunkWindow(startDate, endDate);
    for (const chunk of chunks) {
      expect(new Date(chunk.startMs).getHours()).toBe(0);
      expect(new Date(chunk.endMs).getHours()).toBe(0);
    }
  });
});

// ── Task 4: _determineSyncWindows — two-segment window resolution ────────────

describe('Task 4: _determineSyncWindows — two-segment window resolution', () => {
  /** Fixed "now" for every test in this block: June 15, 2025 09:00 LOCAL time. */
  const TODAY = new Date(2025, 5, 15, 9, 0, 0, 0);

  /**
   * Build a minimal Dexie double exposing only the surface
   * _determineSyncWindows is allowed to touch.
   *
   * @param {object}  opts
   * @param {object=} opts.oldest         Row returned by orderBy('date').first()
   * @param {object=} opts.latest         Row returned by orderBy('date').last()
   * @param {object=} opts.flagRow        Row returned by settings.get(key)
   * @param {Error=}  opts.settingsError  When set, settings.get rejects with it
   */
  function makeDb({ oldest, latest, flagRow, anchorRow, settingsError, anchorError } = {}) {
    const get = vi.fn((key) => {
      if (settingsError) return Promise.reject(settingsError);
      if (key === 'sync_anchor_date') {
        if (anchorError) return Promise.reject(anchorError);
        return Promise.resolve(anchorRow);
      }
      return Promise.resolve(flagRow);
    });
    return {
      settings: { get, put: vi.fn() },
      daily_records: {
        orderBy: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(oldest),
          last: vi.fn().mockResolvedValue(latest),
        }),
      },
    };
  }

  /** Tomorrow's local midnight relative to the frozen clock. */
  const tomorrowMs = () => _addDays(_localMidnight(new Date()), 1).getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── Empty database ─────────────────────────────────────────────────────────

  it('empty daily_records → a single anchor→tomorrow window tagged Full history sync', async () => {
    const db = makeDb({ oldest: undefined, latest: undefined });

    const windows = await _determineSyncWindows(db);

    expect(windows.length).toBe(1);
    expect(windows[0].startMs).toBe(_localMidnight(DEFAULT_SYNC_ANCHOR).getTime());
    expect(windows[0].endMs).toBe(tomorrowMs());
    expect(windows[0].phase).toBe(PHASE_FULL_HISTORY);
    expect(PHASE_FULL_HISTORY).toBe('Full history sync');
  });

  // ── Fully backfilled ───────────────────────────────────────────────────────

  it("fully backfilled DB (oldest.date === '2013-01-01', flag true) → one incremental window", async () => {
    const db = makeDb({
      oldest: { date: '2013-01-01' },
      latest: { date: '2025-06-14' },
      flagRow: { key: BACKFILL_COMPLETE_KEY, value: true },
    });

    const windows = await _determineSyncWindows(db);

    expect(windows.length).toBe(1);
    expect(windows[0].phase).toBe(PHASE_INCREMENTAL);
    expect(PHASE_INCREMENTAL).toBe('Incremental sync');
  });

  it('oldest.date before the default anchor with the flag absent → incremental window only', async () => {
    const db = makeDb({
      oldest: { date: '2013-01-01' },
      latest: { date: '2025-06-14' },
      flagRow: undefined,
    });

    const windows = await _determineSyncWindows(db);

    expect(windows.length).toBe(1);
    expect(windows[0].phase).toBe(PHASE_INCREMENTAL);
  });

  // ── Partially backfilled ───────────────────────────────────────────────────

  it('partially backfilled DB with the flag absent → [Incremental sync, Full history sync]', async () => {
    const db = makeDb({
      oldest: { date: '2024-01-10' },
      latest: { date: '2025-06-14' },
      flagRow: undefined,
    });

    const windows = await _determineSyncWindows(db);

    expect(windows.length).toBe(2);
    expect(windows[0].phase).toBe(PHASE_INCREMENTAL);
    expect(windows[1].phase).toBe(PHASE_FULL_HISTORY);
  });

  it('the backfill segment leaves no uncovered day at the seam with the stored range', async () => {
    // Stored rows already cover [oldest … latest]. The backfill window must reach
    // at least the oldest stored day, and the incremental window must start no
    // later than the latest stored day — so anchor→tomorrow is fully covered.
    const db = makeDb({
      oldest: { date: '2024-01-10' },
      latest: { date: '2025-06-14' },
      flagRow: undefined,
    });
    const oldestMidnightMs = new Date(2024, 0, 10).getTime();
    const latestMidnightMs = new Date(2025, 5, 14).getTime();

    const [incremental, backfill] = await _determineSyncWindows(db);

    expect(backfill.startMs).toBe(_localMidnight(DEFAULT_SYNC_ANCHOR).getTime());
    expect(backfill.endMs).toBeGreaterThan(oldestMidnightMs);
    expect(incremental.startMs).toBeLessThanOrEqual(latestMidnightMs);
    expect(incremental.endMs).toBe(tomorrowMs());
  });

  it('backfill window end equals oldest local midnight plus one day (overlap guard)', async () => {
    const db = makeDb({
      oldest: { date: '2024-01-10' },
      latest: { date: '2025-06-14' },
      flagRow: undefined,
    });

    const windows = await _determineSyncWindows(db);

    const expectedEnd = _addDays(new Date(2024, 0, 10), 1).getTime();
    expect(windows[1].endMs).toBe(expectedEnd);
  });

  // ── Latch flag semantics ───────────────────────────────────────────────────

  it('flag row { value: true } → one incremental window even when oldest.date > anchor', async () => {
    const db = makeDb({
      oldest: { date: '2024-01-10' },
      latest: { date: '2025-06-14' },
      flagRow: { key: BACKFILL_COMPLETE_KEY, value: true },
    });

    const windows = await _determineSyncWindows(db);

    expect(windows.length).toBe(1);
    expect(windows[0].phase).toBe(PHASE_INCREMENTAL);
    expect(db.settings.get).toHaveBeenCalledWith(BACKFILL_COMPLETE_KEY);
  });

  it('flag row { value: false } → treated as not complete; backfill window emitted', async () => {
    const db = makeDb({
      oldest: { date: '2024-01-10' },
      latest: { date: '2025-06-14' },
      flagRow: { key: BACKFILL_COMPLETE_KEY, value: false },
    });

    const windows = await _determineSyncWindows(db);

    expect(windows.length).toBe(2);
    expect(windows[1].phase).toBe(PHASE_FULL_HISTORY);
  });

  it("flag row with a truthy-but-not-true value ('yes') → treated as not complete", async () => {
    const db = makeDb({
      oldest: { date: '2024-01-10' },
      latest: { date: '2025-06-14' },
      flagRow: { key: BACKFILL_COMPLETE_KEY, value: 'yes' },
    });

    const windows = await _determineSyncWindows(db);

    expect(windows.length).toBe(2);
  });

  it('db.settings.get rejecting → treated as not complete; backfill emitted, no throw, error logged', async () => {
    const db = makeDb({
      oldest: { date: '2024-01-10' },
      latest: { date: '2025-06-14' },
      settingsError: new Error('IDB read failed'),
    });

    const windows = await _determineSyncWindows(db);

    expect(windows.length).toBe(2);
    expect(windows[1].phase).toBe(PHASE_FULL_HISTORY);
    expect(console.error).toHaveBeenCalled();
    expect(console.error.mock.calls[0][0]).toContain('[steps]');
  });

  // ── Incremental start / window end arithmetic ──────────────────────────────

  it('incremental start equals latest local midnight minus SAFETY_BUFFER_DAYS (10 days ago → 13 days ago)', async () => {
    // Acceptance Scenario 3: newest record is 10 days old → window starts 13 days ago.
    const latestDate = _addDays(_localMidnight(TODAY), -10);
    const db = makeDb({
      oldest: { date: '2013-01-01' },
      latest: { date: _formatLocalDate(latestDate.getTime()) },
      flagRow: { key: BACKFILL_COMPLETE_KEY, value: true },
    });

    const windows = await _determineSyncWindows(db);

    const expectedStart = _addDays(_localMidnight(TODAY), -13);
    expect(windows[0].startMs).toBe(expectedStart.getTime());
    expect(new Date(windows[0].startMs).getHours()).toBe(0);
    expect(SAFETY_BUFFER_DAYS).toBe(3);
  });

  it("resolves a 'YYYY-MM-DD' row date on its own local calendar day (never UTC-parsed)", async () => {
    // new Date('2025-06-05') is UTC-parsed and would fall on June 4 in negative-offset
    // zones, shifting the incremental start to June 1 instead of June 2.
    const db = makeDb({
      oldest: { date: '2013-01-01' },
      latest: { date: '2025-06-05' },
      flagRow: { key: BACKFILL_COMPLETE_KEY, value: true },
    });

    const windows = await _determineSyncWindows(db);

    const start = new Date(windows[0].startMs);
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(5); // June
    expect(start.getDate()).toBe(2);
    expect(start.getHours()).toBe(0);
  });

  it('_localMidnight fails fast on a malformed date string rather than guessing', () => {
    expect(() => _localMidnight('05/06/2025')).toThrow(TypeError);
    expect(() => _localMidnight('2025-6-5')).toThrow(/YYYY-MM-DD/);
    expect(() => _localMidnight('')).toThrow(TypeError);
  });

  it("every emitted window's bounds land on local midnight", async () => {
    const db = makeDb({
      oldest: { date: '2024-01-10' },
      latest: { date: '2025-06-14' },
      flagRow: undefined,
    });

    const windows = await _determineSyncWindows(db);

    for (const window of windows) {
      expect(new Date(window.startMs).getHours()).toBe(0);
      expect(new Date(window.endMs).getHours()).toBe(0);
      expect(new Date(window.startMs).getMinutes()).toBe(0);
      expect(new Date(window.endMs).getMilliseconds()).toBe(0);
    }
  });

  it("the recent window always ends at tomorrow's local midnight so today is refreshed", async () => {
    const db = makeDb({
      oldest: { date: '2024-01-10' },
      latest: { date: _formatLocalDate(_localMidnight(TODAY).getTime()) },
      flagRow: undefined,
    });

    const windows = await _determineSyncWindows(db);

    expect(windows[0].endMs).toBe(new Date(2025, 5, 16).getTime());
    expect(windows[0].endMs).toBe(tomorrowMs());
  });

  it('window objects are shaped { startMs, endMs, phase } — same base shape as _chunkWindow output', async () => {
    const db = makeDb({
      oldest: { date: '2024-01-10' },
      latest: { date: '2025-06-14' },
      flagRow: undefined,
    });

    const windows = await _determineSyncWindows(db);

    for (const window of windows) {
      expect(Object.keys(window).sort()).toEqual(['endMs', 'phase', 'startMs']);
      expect(typeof window.startMs).toBe('number');
      expect(typeof window.endMs).toBe('number');
      expect(window.endMs).toBeGreaterThan(window.startMs);
    }
  });

  // ── Regression ─────────────────────────────────────────────────────────────

  it('db.js exports DB_VERSION = 6 (ST-009 schema bump from 5 to 6)', () => {
    expect(DB_VERSION).toBe(6);
  });


  // ── Task 5: Dynamic anchor read in _determineSyncWindows ──────────────────

  it('uses stored sync_anchor_date as window start when present', async () => {
    const db = makeDb({
      oldest: undefined,
      latest: undefined,
      anchorRow: { key: 'sync_anchor_date', value: '2020-06-01' },
    });

    const windows = await _determineSyncWindows(db);

    expect(windows.length).toBe(1);
    expect(windows[0].startMs).toBe(_localMidnight('2020-06-01').getTime());
  });

  it('falls back to DEFAULT_SYNC_ANCHOR when sync_anchor_date row is absent', async () => {
    const db = makeDb({
      oldest: undefined,
      latest: undefined,
      anchorRow: undefined,
    });

    const windows = await _determineSyncWindows(db);

    expect(windows[0].startMs).toBe(_localMidnight(DEFAULT_SYNC_ANCHOR).getTime());
  });

  it('falls back to DEFAULT_SYNC_ANCHOR when sync_anchor_date value is empty string', async () => {
    const db = makeDb({
      oldest: undefined,
      latest: undefined,
      anchorRow: { key: 'sync_anchor_date', value: '' },
    });

    const windows = await _determineSyncWindows(db);

    expect(windows[0].startMs).toBe(_localMidnight(DEFAULT_SYNC_ANCHOR).getTime());
  });

  it('falls back to DEFAULT_SYNC_ANCHOR on DB read throw; console.error("[steps]", err) called', async () => {
    const anchorError = new Error('IDB anchor read failed');
    const db = makeDb({
      oldest: undefined,
      latest: undefined,
      anchorError,
      flagRow: undefined,
    });

    const windows = await _determineSyncWindows(db);

    expect(windows[0].startMs).toBe(_localMidnight(DEFAULT_SYNC_ANCHOR).getTime());
    expect(console.error).toHaveBeenCalled();
    expect(console.error.mock.calls.some(call => call[0] === '[steps]')).toBe(true);
  });

  it('an anchor earlier than 2018 (e.g. 2015-03-10) is honored as-is — no clamp', async () => {
    const db = makeDb({
      oldest: undefined,
      latest: undefined,
      anchorRow: { key: 'sync_anchor_date', value: '2015-03-10' },
    });

    const windows = await _determineSyncWindows(db);

    expect(windows[0].startMs).toBe(_localMidnight('2015-03-10').getTime());
  });

  it('DEFAULT_SYNC_ANCHOR is exported as the string "2018-01-01"', () => {
    expect(DEFAULT_SYNC_ANCHOR).toBe('2018-01-01');
  });

  it('DEFAULT_SYNC_ANCHOR in steps.js is the same value as DEFAULT_SYNC_ANCHOR in settings.js (single source of truth)', async () => {
    const { DEFAULT_SYNC_ANCHOR: settingsAnchor } = await import('./settings.js');
    expect(DEFAULT_SYNC_ANCHOR).toBe(settingsAnchor);
  });

  // ── Pre-flight token guard (covered orchestrator-level in Task 9/10) ───────
});

// ── Task 7: _upsertChunk — transactional override-preserving upsert ────────────

describe('Task 7: _upsertChunk — transactional override-preserving upsert', () => {
  /** Timestamp captured just before each test; used to assert synced_at is refreshed. */
  let testStartTimestamp;

  /** Shared db double — transaction mock calls its callback; bulkGet/bulkPut spied. */
  let db;

  /**
   * Build one incoming API record (the shape _toDailyRecords produces).
   */
  function makeApiRecord({
    date = '2025-06-15',
    original_steps = 5000,
    original_distance_km = 3.81,
    effective_steps = 5000,
    effective_distance_km = 3.81,
  } = {}) {
    return {
      date,
      original_steps,
      original_distance_km,
      effective_steps,
      effective_distance_km,
      synced_at: new Date().toISOString(),
    };
  }

  /**
   * Build a pre-existing DB row with full columns.
   */
  function makeExistingRow({
    date = '2025-06-15',
    original_steps = 3000,
    original_distance_km = 2.286,
    effective_steps = 3000,
    effective_distance_km = 2.286,
    is_overridden = false,
    override = null,
    synced_at = '2025-01-01T00:00:00.000Z',
  } = {}) {
    return {
      date,
      original_steps,
      original_distance_km,
      effective_steps,
      effective_distance_km,
      is_overridden,
      override,
      synced_at,
    };
  }

  beforeEach(() => {
    testStartTimestamp = Date.now();

    db = {
      daily_records: {
        orderBy: vi.fn(),
        first: vi.fn(),
        last: vi.fn(),
        bulkGet: vi.fn(),
        bulkPut: vi.fn(),
      },
      settings: { get: vi.fn(), put: vi.fn() },
      transaction: vi.fn(),
    };

    // Make db.transaction actually execute the callback so the inner logic runs.
    db.transaction.mockImplementation(async (_mode, _table, callback) => {
      return callback();
    });

    db.daily_records.bulkPut.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── Absent date → insert with sentinel defaults ─────────────────────────────

  it('absent date is inserted with is_overridden: false and override: null', async () => {
    const record = makeApiRecord();
    db.daily_records.bulkGet.mockResolvedValue([undefined]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows.length).toBe(1);
    expect(rows[0].is_overridden).toBe(false);
    expect(rows[0].override).toBeNull();
  });

  it('absent date is inserted with original_steps and effective_steps from the API record', async () => {
    // _toDailyRecords always sets effective_steps === original_steps on a fresh API record.
    const record = makeApiRecord({ original_steps: 7500, effective_steps: 7500 });
    db.daily_records.bulkGet.mockResolvedValue([undefined]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows[0].original_steps).toBe(7500);
    expect(rows[0].effective_steps).toBe(7500);
  });

  it('absent date: synced_at is an ISO 8601 string >= testStartTimestamp', async () => {
    const record = makeApiRecord();
    db.daily_records.bulkGet.mockResolvedValue([undefined]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    const syncedMs = new Date(rows[0].synced_at).getTime();
    expect(syncedMs).toBeGreaterThanOrEqual(testStartTimestamp);
  });

  // ── Present, is_overridden !== true → overwrite original_* and effective_* ──

  it('existing record with is_overridden: false — original_steps and effective_steps overwritten', async () => {
    const existing = makeExistingRow({ original_steps: 3000, effective_steps: 3000 });
    const record = makeApiRecord({ original_steps: 5000, effective_steps: 5000 });
    db.daily_records.bulkGet.mockResolvedValue([existing]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows[0].original_steps).toBe(5000);
    expect(rows[0].effective_steps).toBe(5000);
  });

  it('existing record with is_overridden: false — original_distance_km and effective_distance_km overwritten', async () => {
    const existing = makeExistingRow({ original_distance_km: 2.0, effective_distance_km: 2.0 });
    const record = makeApiRecord({ original_distance_km: 4.5, effective_distance_km: 4.5 });
    db.daily_records.bulkGet.mockResolvedValue([existing]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows[0].original_distance_km).toBe(4.5);
    expect(rows[0].effective_distance_km).toBe(4.5);
  });

  it('existing record with is_overridden: false — synced_at is refreshed', async () => {
    const existing = makeExistingRow({ synced_at: '2025-01-01T00:00:00.000Z' });
    const record = makeApiRecord();
    db.daily_records.bulkGet.mockResolvedValue([existing]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    const syncedMs = new Date(rows[0].synced_at).getTime();
    expect(syncedMs).toBeGreaterThanOrEqual(testStartTimestamp);
  });

  // ── Present, is_overridden === true → update original_* only ─────────────────

  it('existing record with is_overridden: true — original_steps updated to new API value', async () => {
    const existing = makeExistingRow({
      original_steps: 3000,
      effective_steps: 6000,
      is_overridden: true,
      override: { steps: 6000 },
    });
    const record = makeApiRecord({ original_steps: 5000 });
    db.daily_records.bulkGet.mockResolvedValue([existing]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows[0].original_steps).toBe(5000);
  });

  it('existing record with is_overridden: true — effective_steps unchanged (carries user override)', async () => {
    const existing = makeExistingRow({
      original_steps: 3000,
      effective_steps: 6000,
      is_overridden: true,
      override: { steps: 6000 },
    });
    const record = makeApiRecord({ original_steps: 5000, effective_steps: 5000 });
    db.daily_records.bulkGet.mockResolvedValue([existing]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows[0].effective_steps).toBe(6000);
  });

  it('existing record with is_overridden: true — effective_distance_km unchanged (carries user override)', async () => {
    const existing = makeExistingRow({
      effective_distance_km: 9.9,
      is_overridden: true,
      override: { steps: 6000 },
    });
    const record = makeApiRecord({ effective_distance_km: 4.5 });
    db.daily_records.bulkGet.mockResolvedValue([existing]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows[0].effective_distance_km).toBe(9.9);
  });

  it('existing record with is_overridden: true — override object carried through byte-for-byte', async () => {
    const overrideObj = { steps: 6000, note: 'manually entered' };
    const existing = makeExistingRow({
      is_overridden: true,
      override: overrideObj,
    });
    const record = makeApiRecord();
    db.daily_records.bulkGet.mockResolvedValue([existing]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows[0].override).toEqual(overrideObj);
    // Must be the same object reference (or deep equal), NOT replaced by null
    expect(rows[0].override).not.toBeNull();
    expect(rows[0].is_overridden).toBe(true);
  });

  it('existing record with is_overridden: true — synced_at is refreshed', async () => {
    const existing = makeExistingRow({
      is_overridden: true,
      override: { steps: 9000 },
      synced_at: '2025-01-01T00:00:00.000Z',
    });
    const record = makeApiRecord();
    db.daily_records.bulkGet.mockResolvedValue([existing]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    const syncedMs = new Date(rows[0].synced_at).getTime();
    expect(syncedMs).toBeGreaterThanOrEqual(testStartTimestamp);
  });

  // ── synced_at refreshed on every record regardless of merge branch ───────────

  it('synced_at >= testStartTimestamp on every written record (absent and existing)', async () => {
    const records = [
      makeApiRecord({ date: '2025-06-13' }),
      makeApiRecord({ date: '2025-06-14' }),
      makeApiRecord({ date: '2025-06-15' }),
    ];
    // First is absent, second has is_overridden false, third has is_overridden true
    db.daily_records.bulkGet.mockResolvedValue([
      undefined,
      makeExistingRow({ date: '2025-06-14', is_overridden: false }),
      makeExistingRow({ date: '2025-06-15', is_overridden: true, override: { steps: 9000 } }),
    ]);

    await _upsertChunk(db, records);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    for (const row of rows) {
      const syncedMs = new Date(row.synced_at).getTime();
      expect(syncedMs).toBeGreaterThanOrEqual(testStartTimestamp);
    }
  });

  // ── Transaction scope and call count ─────────────────────────────────────────

  it('merge runs inside a single db.transaction("rw", db.daily_records, …) call per chunk', async () => {
    db.daily_records.bulkGet.mockResolvedValue([undefined]);

    await _upsertChunk(db, [makeApiRecord()]);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    const [mode, table] = db.transaction.mock.calls[0];
    expect(mode).toBe('rw');
    expect(table).toBe(db.daily_records);
  });

  it('transaction scope is daily_records only — not settings', async () => {
    db.daily_records.bulkGet.mockResolvedValue([undefined]);

    await _upsertChunk(db, [makeApiRecord()]);

    const [, table] = db.transaction.mock.calls[0];
    // Second arg must be daily_records, not settings or an array including settings
    expect(table).toBe(db.daily_records);
    expect(table).not.toBe(db.settings);
  });

  it('exactly one bulkPut call is issued per chunk', async () => {
    db.daily_records.bulkGet.mockResolvedValue([undefined, undefined]);

    await _upsertChunk(db, [makeApiRecord({ date: '2025-06-14' }), makeApiRecord({ date: '2025-06-15' })]);

    expect(db.daily_records.bulkPut).toHaveBeenCalledTimes(1);
  });

  it('a run with two chunks issues exactly two separate db.transaction calls', async () => {
    db.daily_records.bulkGet
      .mockResolvedValueOnce([undefined])
      .mockResolvedValueOnce([undefined]);

    await _upsertChunk(db, [makeApiRecord({ date: '2025-06-14' })]);
    await _upsertChunk(db, [makeApiRecord({ date: '2025-06-15' })]);

    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(db.daily_records.bulkPut).toHaveBeenCalledTimes(2);
  });

  // ── High-water mark: effective_* never decreases (non-overridden rows) ─────

  it('scrubbed day — original_steps drops to cloud truth, effective_steps keeps the higher stored value', async () => {
    const existing = makeExistingRow({ original_steps: 7500, effective_steps: 7500 });
    const record = makeApiRecord({ original_steps: 5000, effective_steps: 5000 });
    db.daily_records.bulkGet.mockResolvedValue([existing]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows[0].original_steps).toBe(5000);
    expect(rows[0].effective_steps).toBe(7500);
  });

  it('scrubbed day — original_distance_km drops, effective_distance_km keeps the higher stored value', async () => {
    const existing = makeExistingRow({
      original_distance_km: 5.715,
      effective_distance_km: 5.715,
    });
    const record = makeApiRecord({ original_distance_km: 3.81, effective_distance_km: 3.81 });
    db.daily_records.bulkGet.mockResolvedValue([existing]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows[0].original_distance_km).toBe(3.81);
    expect(rows[0].effective_distance_km).toBe(5.715);
  });

  it('a rising cloud value still raises effective_steps (max wins)', async () => {
    const existing = makeExistingRow({ original_steps: 5000, effective_steps: 5000 });
    const record = makeApiRecord({ original_steps: 9000, effective_steps: 9000 });
    db.daily_records.bulkGet.mockResolvedValue([existing]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows[0].original_steps).toBe(9000);
    expect(rows[0].effective_steps).toBe(9000);
  });

  it('an equal cloud value leaves effective_steps unchanged', async () => {
    const existing = makeExistingRow({ original_steps: 6000, effective_steps: 6000 });
    const record = makeApiRecord({ original_steps: 6000, effective_steps: 6000 });
    db.daily_records.bulkGet.mockResolvedValue([existing]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows[0].effective_steps).toBe(6000);
  });

  it('overridden rows are exempt — a higher cloud value does not bump the user override', async () => {
    const existing = makeExistingRow({
      original_steps: 3000,
      effective_steps: 4000,
      is_overridden: true,
      override: { steps: 4000 },
    });
    const record = makeApiRecord({ original_steps: 9000, effective_steps: 9000 });
    db.daily_records.bulkGet.mockResolvedValue([existing]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows[0].original_steps).toBe(9000);
    expect(rows[0].effective_steps).toBe(4000);
  });

  it('a corrupt non-finite existing effective value cannot pin a stale number', async () => {
    const existing = makeExistingRow({ original_steps: NaN, effective_steps: NaN });
    const record = makeApiRecord({ original_steps: 4000, effective_steps: 4000 });
    db.daily_records.bulkGet.mockResolvedValue([existing]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows[0].effective_steps).toBe(4000);
  });

  it('_effectiveHighWater — pure helper returns the higher finite value', async () => {
    expect(_effectiveHighWater(7500, 5000)).toBe(7500);
    expect(_effectiveHighWater(5000, 7500)).toBe(7500);
    expect(_effectiveHighWater(5000, 5000)).toBe(5000);
    expect(_effectiveHighWater(undefined, 4000)).toBe(4000);
    expect(_effectiveHighWater(NaN, 4000)).toBe(4000);
  });
});

describe('Task 8: _latchBackfillComplete — backfill completion latch', () => {
  let db;

  /**
   * Build a minimal Dexie double exposing only the surface the latch touches.
   *
   * @param {object}  opts
   * @param {object=} opts.oldest        Row returned by orderBy('date').first()
   * @param {Error=}  opts.putError      When set, settings.put rejects with it
   */
  function makeDb({ oldest, putError } = {}) {
    return {
      daily_records: {
        orderBy: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(oldest),
        }),
      },
      settings: {
        put: putError
          ? vi.fn().mockRejectedValue(putError)
          : vi.fn().mockResolvedValue(undefined),
      },
      transaction: vi.fn(),
    };
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** The anchor these cases latch against: local midnight on 2013-01-01. */
  const ANCHOR_2013_MS = new Date(2013, 0, 1).getTime();

  // ── Oldest record reaches or passes the anchor → latch ─────────────────────

  it("puts { key: BACKFILL_COMPLETE_KEY, value: true } when the oldest record reaches the anchor", async () => {
    const db = makeDb({ oldest: { date: '2013-01-01' } });

    await _latchBackfillComplete(db, ANCHOR_2013_MS);

    expect(db.settings.put).toHaveBeenCalledTimes(1);
    expect(db.settings.put).toHaveBeenCalledWith({
      key: BACKFILL_COMPLETE_KEY,
      value: true,
    });
  });

  it('latches when the oldest record predates the anchor (dates before 2013)', async () => {
    const db = makeDb({ oldest: { date: '2012-12-31' } });

    await _latchBackfillComplete(db, ANCHOR_2013_MS);

    expect(db.settings.put).toHaveBeenCalledTimes(1);
    expect(db.settings.put).toHaveBeenCalledWith({
      key: BACKFILL_COMPLETE_KEY,
      value: true,
    });
  });

  it('latches exactly once — a single put call for a single invocation', async () => {
    const db = makeDb({ oldest: { date: '2013-01-01' } });

    await _latchBackfillComplete(db, ANCHOR_2013_MS);
    await _latchBackfillComplete(db, ANCHOR_2013_MS);

    // Each invocation performs its own read+write; a single run writes once.
    expect(db.daily_records.orderBy).toHaveBeenCalledWith('date');
  });

  // ── Oldest record still newer than the anchor → no latch ───────────────────

  it('does not latch when the oldest record is still newer than the anchor', async () => {
    const db = makeDb({ oldest: { date: '2013-01-02' } });

    await _latchBackfillComplete(db, ANCHOR_2013_MS);

    expect(db.settings.put).not.toHaveBeenCalled();
  });

  // ── Rejected write is non-fatal ─────────────────────────────────────────────

  it('a rejecting settings.put logs console.error and does not throw', async () => {
    const putError = new Error('write blocked');
    const db = makeDb({ oldest: { date: '2013-01-01' }, putError });

    await expect(_latchBackfillComplete(db, ANCHOR_2013_MS)).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith('[steps]', putError);
  });

  // ── Transaction isolation and schema ────────────────────────────────────────

  it('latches against the configured anchor, not a fixed 2013 floor (default 2018-01-01 horizon)', async () => {
    const db = makeDb({ oldest: { date: '2018-01-01' } });

    await _latchBackfillComplete(db, new Date(2018, 0, 1).getTime());

    expect(db.settings.put).toHaveBeenCalledWith({ key: BACKFILL_COMPLETE_KEY, value: true });
  });

  it('does not latch when the oldest record is newer than the configured anchor', async () => {
    const db = makeDb({ oldest: { date: '2018-01-02' } });

    await _latchBackfillComplete(db, new Date(2018, 0, 1).getTime());

    expect(db.settings.put).not.toHaveBeenCalled();
  });

  it('fails fast on a non-finite anchor without reading or writing', async () => {
    const db = makeDb({ oldest: { date: '2018-01-01' } });

    await expect(_latchBackfillComplete(db, Number.NaN)).rejects.toThrow(TypeError);
    await expect(_latchBackfillComplete(db)).rejects.toThrow(TypeError);

    expect(db.daily_records.orderBy).not.toHaveBeenCalled();
    expect(db.settings.put).not.toHaveBeenCalled();
  });

  it('the put is issued outside any db.transaction call', async () => {
    const db = makeDb({ oldest: { date: '2013-01-01' } });

    await _latchBackfillComplete(db, ANCHOR_2013_MS);

    expect(db.transaction).not.toHaveBeenCalled();
  });
});

// ── Task 9: sync() orchestrator — guards, run loop, progress and success ─────

describe('Task 9: sync() orchestrator — guards, run loop, progress and success messages', () => {
  /** Fixed "now" for every test in this block: June 15, 2025 09:00 local time. */
  const TODAY = new Date(2025, 5, 15, 9, 0, 0, 0);

  let auth, db, reporter;

  /**
   * Stub global fetch. The default implementation derives one bucket at the
   * request body's startTimeMillis so a persisted oldest record converges to
   * the anchor when a full backfill run completes.
   */
  function stubFetch(impl) {
    const mock = impl
      ? vi.fn(impl)
      : vi.fn(async (_url, init) => {
        const body = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            bucket: [
              {
                startTimeMillis: String(body.startTimeMillis),
                dataset: [
                  {
                    dataSourceId:
                      'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps',
                    point: [{ value: [{ intVal: 500 }] }],
                  },
                ],
              },
            ],
          }),
        };
      });
    vi.stubGlobal('fetch', mock);
    return mock;
  }

  const lastSyncMessage = () => lastSyncMessageFor(reporter);
  const messages = () => reporter.sync.mock.calls.map((call) => call[0]);

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    auth = { getAccessToken: vi.fn().mockReturnValue('tok-abc') };
    reporter = { db: vi.fn(), auth: vi.fn(), sync: vi.fn() };
    document.body.innerHTML = '<button id="sync-btn">Sync Steps</button>';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── Re-entrancy guard (decision 13) ───────────────────────────────────────

  it('a second sync() while the first is in flight returns immediately and issues no fetch', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-06-12')] });

    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const fetchMock = stubFetch(async () => {
      await gate;
      return { ok: true, status: 200, json: async () => ({ bucket: [] }) };
    });

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    const first = engine.sync();

    await vi.advanceTimersByTimeAsync(0);
    const fetchCalls = fetchMock.mock.calls.length;
    const messageCount = reporter.sync.mock.calls.length;

    // The first run must genuinely be in flight — two fetches issued (daily +
    // hourly, parallel), both hanging on the gate, no status line written yet.
    expect(fetchCalls).toBe(2);
    expect(messageCount).toBe(0);

    await engine.sync();

    expect(fetchMock.mock.calls.length).toBe(fetchCalls);
    expect(reporter.sync.mock.calls.length).toBe(messageCount);

    release();
    await first;
  });

  it('a re-entrant sync() does not emit status while the first run is in flight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-06-12')] });

    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    stubFetch(async () => {
      await gate;
      return { ok: true, status: 200, json: async () => ({ bucket: [] }) };
    });

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    const first = engine.sync();

    await vi.advanceTimersByTimeAsync(0);
    const inFlightCount = reporter.sync.mock.calls.length;

    // The first run must genuinely be in flight — no status line written yet.
    expect(inFlightCount).toBe(0);

    await engine.sync();

    expect(reporter.sync.mock.calls.length).toBe(inFlightCount);
    expect(reporter.sync).not.toHaveBeenCalledWith(
      '🔑 Connect your Google Account first'
    );

    release();
    await first;
  });

  // ── Button lifecycle (decision 12a finally contract) ──────────────────────

  it('#sync-btn is disabled immediately after the entry guards pass, before any await resolves', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-06-12')] });

    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    stubFetch(async () => {
      await gate;
      return { ok: true, status: 200, json: async () => ({ bucket: [] }) };
    });

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    const pending = engine.sync();

    expect(syncBtn().disabled).toBe(true);
    expect(syncBtn().textContent).toBe('Syncing…');

    release();
    await pending;
  });

  it('#sync-btn is re-enabled in finally after a successful run', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-06-12')] });
    stubFetch();

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    expect(syncBtn().disabled).toBe(false);
  });

  it('#sync-btn.textContent is restored to exactly "Sync Steps" in finally', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-06-12')] });
    stubFetch();

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    expect(syncBtn().textContent).toBe('Sync Steps');
  });

  it('a doc whose getElementById("sync-btn") returns null → sync() completes normally without throw', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-06-12')] });
    stubFetch();

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, {
      getElementById: () => null,
    });
    await expect(engine.sync()).resolves.toBeUndefined();
    expect(lastSyncMessage()).toContain('up to date');
  });

  // ── Progress messages (decision 12a) ──────────────────────────────────────

  it('a full backfill run writes the opening full-history message first', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeScriptedDb({
      firstSeq: [undefined, { date: '2013-01-01' }, { date: '2013-01-01' }],
      latestValue: undefined,
      flagRow: undefined,
    });
    stubFetch();

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    expect(messages()[0]).toBe(
      '⏳ Full history sync — fetching all Google Fit data since 2018-01-01. This can take several minutes; keep this tab open.'
    );
  });

  it('no per-chunk progress status lines are written during an incremental sync', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeScriptedDb({
      firstSeq: [{ date: '2013-01-01' }, { date: '2013-01-01' }],
      latestValue: { date: '2025-05-01' },
      flagRow: { key: BACKFILL_COMPLETE_KEY, value: true },
    });
    stubFetch();

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    const progress = messages().filter((m) => m.startsWith('⏳'));
    expect(progress).toEqual([]);
  });

  // ── Per-chunk persistence and sequentiality ───────────────────────────────

  it('each chunk is persisted immediately after its own fetch — fetch → upsert interleaving', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    const timeline = [];
    db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-05-01')] });
    db.transaction.mockImplementation(async (_mode, _table, callback) => {
      const result = await callback();
      timeline.push('upsert');
      return result;
    });
    stubFetch(async () => {
      timeline.push('fetch');
      return { ok: true, status: 200, json: async () => ({ bucket: [] }) };
    });

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    // Each chunk now issues two fetches (daily + hourly) before the upsert.
    expect(timeline).toEqual(['fetch', 'fetch', 'upsert', 'fetch', 'fetch', 'upsert']);
  });

  it('requests are strictly sequential — no chunk fetch overlaps the previous upsert', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    let active = 0;
    let maxActive = 0;
    db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-05-01')] });
    stubFetch(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return { ok: true, status: 200, json: async () => ({ bucket: [] }) };
    });

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    // Daily and hourly fetches for the same chunk run in parallel (maxActive = 2).
    // Fetches for different chunks never overlap — chunk N+1 starts only after
    // chunk N's upsert completes, so the max concurrent is bounded to 2 (one chunk).
    expect(maxActive).toBe(2);
  });

  // ── Success message variants (decision 12a) ───────────────────────────────

  it('reports the completed-backfill success message when a full-history run reaches the anchor', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeScriptedDb({
      firstSeq: [undefined, { date: '2013-01-01' }, { date: '2013-01-01' }],
      latestValue: undefined,
      flagRow: undefined,
      anchorRow: { key: 'sync_anchor_date', value: '2013-01-01' },
    });
    stubFetch();

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    const anchorMs = new Date(2013, 0, 1).getTime();
    const endMs = _addDays(_localMidnight(TODAY), 1).getTime();
    const dayCount = Math.round((endMs - anchorMs) / BUCKET_MS);
    const total = _chunkWindow(new Date(anchorMs), new Date(endMs)).length;

    expect(lastSyncMessage()).toBe(
      `✅ Synced ${dayCount} days across ${total} requests — full history complete back to 2013-01-01. Future syncs will be fast.`
    );
  });

  it('reports the incremental "up to date" message when the backfill flag is already set', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeScriptedDb({
      firstSeq: [{ date: '2013-01-01' }, { date: '2013-01-01' }],
      latestValue: { date: '2025-06-12' },
      flagRow: { key: BACKFILL_COMPLETE_KEY, value: true },
    });
    stubFetch();

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    expect(lastSyncMessage()).toBe('✅ Synced 7 days (1 request) — up to date.');
  });

  it('reports the in-progress backfill message when the oldest record is still newer than the anchor', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeScriptedDb({
      firstSeq: [
        { date: '2024-01-10' },
        { date: '2024-01-10' },
        { date: '2024-01-10' },
      ],
      latestValue: { date: '2025-06-14' },
      flagRow: undefined,
      anchorRow: { key: 'sync_anchor_date', value: '2013-01-01' },
    });
    stubFetch();

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    const anchorMs = new Date(2013, 0, 1).getTime();
    const endMs = _addDays(_localMidnight(TODAY), 1).getTime();
    const incStartMs = _addDays(
      _localMidnight(new Date(2025, 5, 14)),
      -SAFETY_BUFFER_DAYS
    ).getTime();
    const backfillEndMs = _addDays(
      _localMidnight(new Date(2024, 0, 10)),
      1
    ).getTime();
    const dayCount =
      Math.round((endMs - incStartMs) / BUCKET_MS) +
      Math.round((backfillEndMs - anchorMs) / BUCKET_MS);

    expect(lastSyncMessage()).toBe(
      `✅ Synced ${dayCount} days — history now goes back to 2024-01-10; click Sync Steps again to continue the backfill.`
    );
  });

  // ── Backfill latch (decision 16) ──────────────────────────────────────────

  it('writes the backfill completion latch exactly once when a full-history run completes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeScriptedDb({
      firstSeq: [undefined, { date: '2013-01-01' }, { date: '2013-01-01' }],
      latestValue: undefined,
      flagRow: undefined,
    });
    stubFetch();

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    expect(db.settings.put).toHaveBeenCalledTimes(1);
    expect(db.settings.put).toHaveBeenCalledWith({
      key: BACKFILL_COMPLETE_KEY,
      value: true,
    });
  });

  // ── Interrupted-backfill resume (decision 16) ─────────────────────────────

  it('a mid-backfill failure leaves the latch unwritten and the next sync resumes at the correct older date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeStatefulDb({ seed: [seedRow('2024-01-10'), seedRow('2025-06-14')], syncAnchor: '2013-01-01' });

    let callNo = 0;
    let dailyCallNo = 0;
    let failMidBackfill = true;
    const fetchMock = stubFetch(async (_url, init) => {
      callNo += 1;
      const body = JSON.parse(init.body);
      const isHourly = body.bucketByTime.durationMillis === HOURLY_BUCKET_MS;
      if (!isHourly) dailyCallNo += 1;
      // Fail on the second *daily* fetch (backfill chunk 1) — not the hourly fetch.
      if (failMidBackfill && !isHourly && dailyCallNo === 2) throw new TypeError('network down');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          bucket: [
            {
              startTimeMillis: String(body.startTimeMillis),
              dataset: [
                {
                  dataSourceId:
                    'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps',
                  point: [{ value: [{ intVal: 500 }] }],
                },
              ],
            },
          ],
        }),
      };
    });

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);

    await engine.sync();
    expect(db.settings.put).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('[steps]', expect.any(Error));
    expect(lastSyncMessage()).not.toContain('✅');
    expect(syncBtn().disabled).toBe(false);
    expect(syncBtn().textContent).toBe('Sync Steps');

    failMidBackfill = false;
    callNo = 0;
    dailyCallNo = 0;
    fetchMock.mockClear();
    db.settings.put.mockClear();

    await engine.sync();

    const bodies = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(init.body)
    );
    const backfillEndMs = _addDays(
      _localMidnight(new Date(2024, 0, 10)),
      1
    ).getTime();
    const anchorMs = new Date(2013, 0, 1).getTime();
    expect(bodies.some((b) => b.endTimeMillis === backfillEndMs)).toBe(true);
    expect(bodies.some((b) => b.startTimeMillis === anchorMs)).toBe(true);
    expect(db.settings.put).toHaveBeenCalledTimes(1);
    expect(db.settings.put).toHaveBeenCalledWith({
      key: BACKFILL_COMPLETE_KEY,
      value: true,
    });
  });
});

// ── Task 10: sync() error contract — every terminal path and the finally ─────
// invariants (decision 12a). Each terminal error must write its exact message
// to #sync-status, log console.error('[steps]', error), keep already-persisted
// chunks, and still unwind the button + isSyncing in finally WITHOUT touching
// #sync-status.

describe('Task 10: sync() error contract — every terminal path and the finally invariants', () => {
  /** Fixed "now" for every test in this block: June 15, 2025 09:00 local time. */
  const TODAY = new Date(2025, 5, 15, 9, 0, 0, 0);

  let auth, db, reporter, syncStatus;

  /** Minimal Response double (mirrors Task 6's). */
  function makeResponse(status, { json = { bucket: [] }, headers = {} } = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: vi.fn((name) => headers[name] ?? null) },
      json: vi.fn().mockResolvedValue(json),
    };
  }

  /** One bucket with no datasets → a single zero-step record for that date. */
  function makeBucket(ms) {
    return { startTimeMillis: String(ms), dataset: [] };
  }

  const lastSyncMessage = () => lastSyncMessageFor(reporter);
  const statusText = () => syncStatus.textContent;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    auth = { getAccessToken: vi.fn().mockReturnValue('tok-abc') };
    db = {};
    document.body.innerHTML = '<button id="sync-btn">Sync Steps</button>';
    syncStatus = document.createElement('div');
    syncStatus.id = 'sync-status';
    document.body.appendChild(syncStatus);
    // The real reporter writes to #sync-status; the mock does the same so the
    // DOM text can be asserted directly, and mock.calls still records messages.
    reporter = {
      db: vi.fn(),
      auth: vi.fn(),
      sync: vi.fn((text) => {
        syncStatus.textContent = text;
      }),
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── Retry exhausted (two consecutive transient statuses) ───────────────────

  it('retry-exhausted (two consecutive 429s) renders the exact ❌ message, keeps prior chunks, and unwinds state', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeStatefulDb({
      seed: [seedRow('2024-01-10'), seedRow('2025-05-01')],
      flag: true,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn()
        // chunk 1 daily — succeeds and persists one day
        .mockResolvedValueOnce(
          makeResponse(200, {
            json: { bucket: [makeBucket(new Date(2025, 4, 17).getTime())] },
          })
        )
        // chunk 1 hourly — fires in parallel with daily (non-fatal)
        .mockResolvedValueOnce(makeResponse(200, { json: { bucket: [] } }))
        // chunk 2 daily attempt 1 → 429 (fires in parallel with chunk 2 hourly)
        .mockResolvedValueOnce(makeResponse(429))
        // chunk 2 hourly — fires in parallel with daily attempt 1 (non-fatal; consumed here)
        .mockResolvedValueOnce(makeResponse(200, { json: { bucket: [] } }))
        // chunk 2 daily attempt 2 (retry after backoff) → 429 → retry-exhausted
        .mockResolvedValueOnce(makeResponse(429))
    );

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    const pending = engine.sync();
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS);
    await pending;

    const expected =
      '❌ Sync stopped at chunk 2/2 — Google Fit returned 429 twice. 1 days saved; click Sync Steps to resume.';
    expect(lastSyncMessage()).toBe(expected);
    expect(statusText()).toBe(expected);
    expect(statusText()).not.toMatch(/^⏳/);
    expect(syncBtn().disabled).toBe(false);
    expect(syncBtn().textContent).toBe('Sync Steps');
    expect(console.error).toHaveBeenCalledWith(
      '[steps]',
      expect.objectContaining({ name: SYNC_ERROR_NAME, kind: FAILURE_RETRY_EXHAUSTED, status: 429 })
    );
    // Chunk 1 persisted before the failure; chunk 2's write never happened.
    expect(db._rows.has('2025-05-17')).toBe(true);
    expect(db._rows.has('2025-04-28')).toBe(false);
  });

  // ── 401 token expired ─────────────────────────────────────────────────────

  it('401 token expired renders the exact 🔑 message with the oldest stored date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeScriptedDb({
      firstSeq: [{ date: '2025-06-09' }, { date: '2025-06-09' }],
      latestValue: { date: '2025-06-12' },
      flagRow: { key: BACKFILL_COMPLETE_KEY, value: true },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(401)));

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    const expected =
      '🔑 Session expired — reconnect your Google Account, then click Sync Steps to continue (history synced back to 2025-06-09).';
    expect(lastSyncMessage()).toBe(expected);
    expect(statusText()).toBe(expected);
    expect(statusText()).not.toMatch(/^⏳/);
    expect(syncBtn().disabled).toBe(false);
    expect(syncBtn().textContent).toBe('Sync Steps');
    expect(console.error).toHaveBeenCalledWith(
      '[steps]',
      expect.objectContaining({ kind: FAILURE_AUTH_EXPIRED, status: 401 })
    );
  });

  it('401 with no stored rows yet renders the oldest placeholder', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeScriptedDb({
      firstSeq: [undefined, undefined],
      latestValue: undefined,
      flagRow: undefined,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(401)));

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    const expected =
      '🔑 Session expired — reconnect your Google Account, then click Sync Steps to continue (history synced back to the beginning).';
    expect(lastSyncMessage()).toBe(expected);
    expect(statusText()).toBe(expected);
  });

  // ── Other non-OK HTTP ─────────────────────────────────────────────────────

  it('other non-OK HTTP (403) renders the exact ❌ message with the status code', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeScriptedDb({
      firstSeq: [{ date: '2013-01-01' }, { date: '2013-01-01' }],
      latestValue: { date: '2025-06-12' },
      flagRow: { key: BACKFILL_COMPLETE_KEY, value: true },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(403)));

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    const expected =
      '❌ Sync stopped at chunk 1/1 — Google Fit returned 403. 0 days saved; click Sync Steps to resume.';
    expect(lastSyncMessage()).toBe(expected);
    expect(statusText()).toBe(expected);
    expect(statusText()).not.toMatch(/^⏳/);
    expect(syncBtn().disabled).toBe(false);
    expect(syncBtn().textContent).toBe('Sync Steps');
    expect(console.error).toHaveBeenCalledWith(
      '[steps]',
      expect.objectContaining({ kind: FAILURE_HTTP_ERROR, status: 403 })
    );
  });

  // ── Network / thrown fetch error ──────────────────────────────────────────

  it('a thrown fetch (network) error renders the exact ❌ message', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeScriptedDb({
      firstSeq: [{ date: '2013-01-01' }, { date: '2013-01-01' }],
      latestValue: { date: '2025-06-12' },
      flagRow: { key: BACKFILL_COMPLETE_KEY, value: true },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    );

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    const expected =
      '❌ Sync stopped at chunk 1/1 — network error. 0 days saved; click Sync Steps to resume.';
    expect(lastSyncMessage()).toBe(expected);
    expect(statusText()).toBe(expected);
    expect(statusText()).not.toMatch(/^⏳/);
    expect(syncBtn().disabled).toBe(false);
    expect(syncBtn().textContent).toBe('Sync Steps');
    expect(console.error).toHaveBeenCalledWith(
      '[steps]',
      expect.objectContaining({ kind: FAILURE_NETWORK_ERROR, status: null })
    );
  });

  it('after a terminal network error, isSyncing is cleared — a second sync() proceeds and issues fetch', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeScriptedDb({
      firstSeq: [{ date: '2013-01-01' }, { date: '2013-01-01' }],
      latestValue: { date: '2025-06-12' },
      flagRow: { key: BACKFILL_COMPLETE_KEY, value: true },
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(makeResponse(200, { json: {} }));
    vi.stubGlobal('fetch', fetchMock);

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);

    await engine.sync();
    expect(lastSyncMessage()).toContain('network error');
    expect(syncBtn().disabled).toBe(false);

    await engine.sync();
    // sync #1: 2 calls (daily network error + hourly fired in parallel).
    // sync #2: 2 calls (daily success + hourly success) → 4 total.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(lastSyncMessage()).toMatch(/^✅/);
    expect(syncBtn().disabled).toBe(false);
    expect(syncBtn().textContent).toBe('Sync Steps');
  });

  // ── Persistence (Dexie) error ─────────────────────────────────────────────

  it('a Dexie upsert rejection renders the exact ❌ database message and keeps prior chunks', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeStatefulDb({
      seed: [seedRow('2024-01-10'), seedRow('2025-05-01')],
      flag: true,
    });
    let upsertCall = 0;
    db.daily_records.bulkPut.mockImplementation(async (records) => {
      upsertCall += 1;
      if (upsertCall === 2) throw new Error('IDB quota exceeded');
      for (const r of records) db._rows.set(r.date, r);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const body = JSON.parse(init.body);
        return makeResponse(200, {
          json: { bucket: [makeBucket(body.startTimeMillis)] },
        });
      })
    );

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    const expected =
      '❌ Sync stopped while saving chunk 2/2 — database error. 1 days saved; click Sync Steps to resume.';
    expect(lastSyncMessage()).toBe(expected);
    expect(statusText()).toBe(expected);
    expect(statusText()).not.toMatch(/^⏳/);
    expect(syncBtn().disabled).toBe(false);
    expect(syncBtn().textContent).toBe('Sync Steps');
    expect(console.error).toHaveBeenCalledWith('[steps]', expect.any(Error));
    // Chunk 1 (2025-05-17) persisted; chunk 2 (2025-04-28) never landed.
    expect(db._rows.has('2025-05-17')).toBe(true);
    expect(db._rows.has('2025-04-28')).toBe(false);
  });

  // ── Missing token (pre-flight guard) ──────────────────────────────────────

  it('missing token renders 🔑 Connect your Google Account first and leaves the button untouched', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    auth.getAccessToken.mockReturnValue(null);
    db = {};

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    expect(lastSyncMessage()).toBe('🔑 Connect your Google Account first');
    expect(statusText()).toBe('🔑 Connect your Google Account first');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(syncBtn().disabled).toBe(false);
    expect(syncBtn().textContent).toBe('Sync Steps');
  });

  it('empty-string token is treated the same as missing — guard fires before any fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    auth.getAccessToken.mockReturnValue('');
    db = {};

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    expect(lastSyncMessage()).toBe('🔑 Connect your Google Account first');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ── Non-fatal settings latch write failure ────────────────────────────────

  it('a settings latch write failure is non-fatal — the ✅ success message still shows and the run is not marked failed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeScriptedDb({
      firstSeq: [undefined, { date: '2013-01-01' }, { date: '2013-01-01' }],
      latestValue: undefined,
      flagRow: undefined,
    });
    const latchError = new Error('latch write blocked');
    db.settings.put.mockRejectedValue(latchError);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const body = JSON.parse(init.body);
        return makeResponse(200, {
          json: { bucket: [makeBucket(body.startTimeMillis)] },
        });
      })
    );

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    expect(lastSyncMessage()).toMatch(/^✅/);
    expect(lastSyncMessage()).toContain('full history complete');
    expect(statusText()).toBe(lastSyncMessage());
    expect(statusText()).not.toContain('❌');
    expect(syncBtn().disabled).toBe(false);
    expect(syncBtn().textContent).toBe('Sync Steps');
    expect(console.error).toHaveBeenCalledWith('[steps]', latchError);
  });

  // ── Unclassified throw before the loop (window resolution) ────────────────

  it('an unclassified throw before any chunk renders the database message with the 1/1 fallback and never issues fetch', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    const orderBy = vi.fn().mockReturnValue({
      first: vi.fn().mockRejectedValue(new Error('index corrupted')),
      last: vi.fn().mockResolvedValue(undefined),
    });
    db = {
      settings: { get: vi.fn().mockResolvedValue(undefined), put: vi.fn() },
      daily_records: { orderBy },
      transaction: vi.fn(),
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    const expected =
      '❌ Sync stopped while saving chunk 1/1 — database error. 0 days saved; click Sync Steps to resume.';
    expect(lastSyncMessage()).toBe(expected);
    expect(statusText()).toBe(expected);
    expect(syncBtn().disabled).toBe(false);
    expect(syncBtn().textContent).toBe('Sync Steps');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('[steps]', expect.any(Error));
  });

  // ── Empty-store full-history success (latch guard + null-oldest branches) ──

  // A full-history run over an empty store that persists zero buckets leaves
  // oldestMs == null and falls through to the incremental "— up to date."
  // success branch (decision 12a). This is a deliberate, pinned fallback, NOT
  // the backfill-completed variant: nothing was persisted and the latch is not
  // written (asserted below), so "full history complete… Future syncs will be
  // fast" would be false. The case is degenerate — decision-6 zero-fill turns
  // every real bucket into a stored record, so oldestMs is null only if the
  // API returned no buckets at all for the whole window.
  it('a full-history run with no stored rows resolves via the empty-store success branch (latch guard, null oldest)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeScriptedDb({
      firstSeq: [undefined, undefined, undefined],
      latestValue: undefined,
      flagRow: undefined,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const body = JSON.parse(init.body);
        return makeResponse(200, {
          json: { bucket: [makeBucket(body.startTimeMillis)] },
        });
      })
    );

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await expect(engine.sync()).resolves.toBeUndefined();

    expect(lastSyncMessage()).toContain('up to date');
    expect(statusText()).toBe(lastSyncMessage());
    expect(syncBtn().disabled).toBe(false);
    expect(syncBtn().textContent).toBe('Sync Steps');
    expect(db.settings.put).not.toHaveBeenCalled();
  });

  // ── _readOldestStoredLabel (decision-12a 401 oldest-date helper) ──────────

  it('_readOldestStoredLabel returns the local date label for the oldest stored row', async () => {
    const db = makeScriptedDb({
      firstSeq: [{ date: '2025-06-09' }],
      latestValue: { date: '2025-06-12' },
      flagRow: undefined,
    });

    await expect(_readOldestStoredLabel(db)).resolves.toBe('2025-06-09');
  });

  it('_readOldestStoredLabel returns null when no stored row exists', async () => {
    const db = makeScriptedDb({
      firstSeq: [undefined],
      latestValue: undefined,
      flagRow: undefined,
    });

    await expect(_readOldestStoredLabel(db)).resolves.toBeNull();
  });

  it('_readOldestStoredLabel fails open — a rejecting read logs and resolves null', async () => {
    const db = {
      daily_records: {
        orderBy: vi.fn().mockReturnValue({
          first: vi.fn().mockRejectedValue(new Error('IDB read failed')),
        }),
      },
    };

    await expect(_readOldestStoredLabel(db)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith('[steps]', expect.any(Error));
  });
});

// ── Task 8 (Review Loopback): Post-sync silent Drive upload hook ──────────────

describe('Task 8: post-sync silent Drive upload hook', () => {
  let auth, db, reporter, doc;
  let driveSync, backup;

  const TODAY = new Date(2025, 5, 19); // 2025-06-19

  function stubFetch() {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ bucket: [] }),
      })
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    auth = { getAccessToken: vi.fn().mockReturnValue('tok-abc') };
    reporter = {
      sync: vi.fn(),
      db: vi.fn(),
      auth: vi.fn(),
    };
    doc = { getElementById: vi.fn().mockReturnValue(null) };
    driveSync = { push: vi.fn().mockResolvedValue(undefined) };
    backup = {
      buildBackup: vi.fn().mockResolvedValue({ schema_version: 1, daily_records: [], settings: [] }),
      markPushed: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Flush the fire-and-forget hook chain: buildBackup → push (→ catch). */
  async function flush() {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  }

  it('calls driveSync.push(buildBackup()) once after a successful sync', async () => {
    db = makeStatefulDb({ seed: [{ date: '2025-06-15' }], flag: { key: 'initial_backfill_complete', value: true } });
    stubFetch();

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup);
    await engine.sync();
    await flush();

    expect(backup.buildBackup).toHaveBeenCalledTimes(1);
    expect(driveSync.push).toHaveBeenCalledTimes(1);
  });

  it('a rejecting driveSync.push does not suppress the ✅ sync status', async () => {
    db = makeStatefulDb({ seed: [{ date: '2025-06-15' }], flag: { key: 'initial_backfill_complete', value: true } });
    stubFetch();
    driveSync.push = vi.fn().mockRejectedValue(new Error('Drive upload failed'));

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup);
    await engine.sync();
    await flush();

    // ✅ status was written
    const calls = reporter.sync.mock.calls.map(([msg]) => msg);
    expect(calls.some((m) => m.startsWith('✅'))).toBe(true);
    // Drive error logged with [drive-sync] prefix
    expect(console.error).toHaveBeenCalledWith('[drive-sync]', expect.any(Error));
  });

  it('passes the silent flag to driveSync.push for the background post-sync hook', async () => {
    db = makeStatefulDb({ seed: [{ date: '2025-06-15' }], flag: { key: 'initial_backfill_complete', value: true } });
    stubFetch();

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup);
    await engine.sync();
    await flush();

    expect(driveSync.push).toHaveBeenCalledWith(
      expect.objectContaining({ schema_version: 1 }),
      { silent: true }
    );
  });

  it('post-sync Drive upload failure stays silent to the user — no Drive reporter notification surfaces', async () => {
    db = makeStatefulDb({ seed: [{ date: '2025-06-15' }], flag: { key: 'initial_backfill_complete', value: true } });
    stubFetch();
    // Faithful to the Task-18 createDriveSync.push contract: the real push
    // will not report through the reporter when the caller opts into silent mode.
    driveSync.push = vi.fn(async (_envelope, opts) => {
      if (!opts?.silent) reporter.db('❌ Drive backup failed — will retry');
      throw new Error('Drive push failed');
    });

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup);
    await engine.sync();
    await flush();

    // The failure is logged for developers, isolated under the [drive-sync] tag…
    expect(console.error).toHaveBeenCalledWith('[drive-sync]', expect.any(Error));
    // …and never surfaced through the reporter: no db/auth notification, and
    // the ✅ sync status written by sync() is not clobbered by a Drive error.
    expect(reporter.db).not.toHaveBeenCalled();
    expect(reporter.auth).not.toHaveBeenCalled();
    const syncMessages = reporter.sync.mock.calls.map(([m]) => m);
    expect(syncMessages.some((m) => m.startsWith('✅'))).toBe(true);
    expect(syncMessages.some((m) => /Drive/.test(m))).toBe(false);
  });

  it('sync succeeds normally when driveSync is null (collaborator not provided)', async () => {
    db = makeStatefulDb({ seed: [{ date: '2025-06-15' }], flag: { key: 'initial_backfill_complete', value: true } });
    stubFetch();

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, null, null);
    await engine.sync();

    const calls = reporter.sync.mock.calls.map(([msg]) => msg);
    expect(calls.some((m) => m.startsWith('✅'))).toBe(true);
    // No Drive push attempted
    expect(driveSync.push).not.toHaveBeenCalled();
  });

  it('sync succeeds normally when driveSync/backup are not passed (legacy call site)', async () => {
    db = makeStatefulDb({ seed: [{ date: '2025-06-15' }], flag: { key: 'initial_backfill_complete', value: true } });
    stubFetch();

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc);
    await engine.sync();

    const calls = reporter.sync.mock.calls.map(([msg]) => msg);
    expect(calls.some((m) => m.startsWith('✅'))).toBe(true);
  });
});

// ── Pre-sync Drive restore recovery: empty local DB on this device ───────────
//
// Bug: a fresh browser profile / localhost signing into a Google account that
// already has cloud step history looked identical to a brand-new user and
// triggered the multi-minute PHASE_FULL_HISTORY backfill from 2013, even
// though a Drive AppData backup already held that history. `sync()` now
// checks `db.daily_records.count()` before resolving the sync windows: an
// empty local table with driveSync/backup collaborators injected triggers a
// `driveSync.pull()` → `backup.restoreBackup()` recovery step first, so
// `_determineSyncWindows` (step 4) sees the repopulated rows and a normal
// incremental sync runs instead.

describe('Pre-sync Drive restore recovery (empty local DB on this device)', () => {
  let auth, db, reporter, doc;
  let driveSync, backup;

  const TODAY = new Date(2025, 5, 19); // 2025-06-19

  function stubFetch() {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ bucket: [] }),
      })
    );
  }

  /** Minimal Dexie double that actually mutates state, for the one real-restoreBackup integration test. */
  function makeRestorableDb() {
    const dailyRows = new Map();
    const settingsRows = new Map();
    const sortAsc = () => [...dailyRows.values()].sort((a, b) => a.date.localeCompare(b.date));
    return {
      daily_records: {
        count: vi.fn(async () => dailyRows.size),
        toArray: vi.fn(async () => sortAsc()),
        orderBy: vi.fn(() => ({
          first: vi.fn(async () => sortAsc()[0]),
          last: vi.fn(async () => sortAsc()[sortAsc().length - 1]),
        })),
        bulkGet: vi.fn(async (dates) => dates.map((d) => dailyRows.get(d))),
        bulkPut: vi.fn(async (records) => {
          for (const r of records) dailyRows.set(r.date, r);
        }),
      },
      settings: {
        get: vi.fn(async (key) => settingsRows.get(key)),
        put: vi.fn(async (row) => settingsRows.set(row.key, row)),
        bulkPut: vi.fn(async (rows) => {
          for (const r of rows) settingsRows.set(r.key, r);
        }),
        toArray: vi.fn(async () => [...settingsRows.values()]),
      },
      // Real Dexie signature is (mode, ...tables, callback) — grab the last
      // arg regardless of how many tables are listed.
      transaction: vi.fn(async (...args) => args[args.length - 1]()),
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    auth = { getAccessToken: vi.fn().mockReturnValue('tok-abc') };
    reporter = { sync: vi.fn(), db: vi.fn(), auth: vi.fn() };
    doc = { getElementById: vi.fn().mockReturnValue(null) };
    driveSync = { pull: vi.fn().mockResolvedValue(null), push: vi.fn().mockResolvedValue(undefined) };
    backup = {
      restoreBackup: vi.fn().mockResolvedValue(undefined),
      buildBackup: vi.fn().mockResolvedValue({ schema_version: 1, daily_records: [], settings: [] }),
      markPushed: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('empty local DB + a Drive backup exists → restores it before the Fit fetch loop runs', async () => {
    db = makeStatefulDb({ seed: [], syncAnchor: '2025-06-15' });
    const envelope = { schema_version: 1, daily_records: [{ date: '2025-06-10' }], settings: [] };
    const callOrder = [];
    driveSync.pull = vi.fn(async () => {
      callOrder.push('pull');
      return envelope;
    });
    backup.restoreBackup = vi.fn(async () => {
      callOrder.push('restore');
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callOrder.push('fit-fetch');
        return { ok: true, json: () => Promise.resolve({ bucket: [] }) };
      })
    );

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup);
    await engine.sync();

    expect(driveSync.pull).toHaveBeenCalledTimes(1);
    // A background recovery attempt: never reports "Drive unavailable" into the
    // connection status (in the Android app the sync runs without Google).
    expect(driveSync.pull).toHaveBeenCalledWith({ silent: true });
    expect(backup.restoreBackup).toHaveBeenCalledWith(envelope);
    expect(callOrder.indexOf('restore')).toBeLessThan(callOrder.indexOf('fit-fetch'));
    const messages = reporter.sync.mock.calls.map(([m]) => m);
    expect(messages.some((m) => m.startsWith('☁️ Restored'))).toBe(true);
  });

  it('empty local DB but no Drive backup exists (pull resolves null) → restoreBackup is skipped and the normal first-time full-history sync proceeds unchanged', async () => {
    db = makeStatefulDb({ seed: [] });
    stubFetch();
    driveSync.pull = vi.fn().mockResolvedValue(null);

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup);
    await engine.sync();

    expect(driveSync.pull).toHaveBeenCalledTimes(1);
    expect(backup.restoreBackup).not.toHaveBeenCalled();
    const messages = reporter.sync.mock.calls.map(([m]) => m);
    expect(messages.some((m) => /full history/i.test(m))).toBe(true);
    expect(messages.some((m) => m.startsWith('☁️ Restored'))).toBe(false);
  });

  it('local DB already has data → driveSync.pull() is never consulted', async () => {
    db = makeStatefulDb({
      seed: [{ date: '2025-06-15' }],
      flag: { key: 'initial_backfill_complete', value: true },
    });
    stubFetch();

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup);
    await engine.sync();

    expect(driveSync.pull).not.toHaveBeenCalled();
    expect(backup.restoreBackup).not.toHaveBeenCalled();
  });

  it('driveSync.pull() rejects → the failure is logged under [drive-sync] and the normal sync still succeeds', async () => {
    db = makeStatefulDb({ seed: [] });
    stubFetch();
    driveSync.pull = vi.fn().mockRejectedValue(new Error('Drive pull failed'));

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup);
    await engine.sync();

    expect(console.error).toHaveBeenCalledWith('[drive-sync]', expect.any(Error));
    expect(backup.restoreBackup).not.toHaveBeenCalled();
    const messages = reporter.sync.mock.calls.map(([m]) => m);
    expect(messages.some((m) => m.startsWith('✅'))).toBe(true);
  });

  it('backup.restoreBackup() rejects (e.g. a tampered/invalid envelope) → the failure is logged under [drive-sync] and the normal sync still succeeds', async () => {
    db = makeStatefulDb({ seed: [] });
    stubFetch();
    driveSync.pull = vi.fn().mockResolvedValue({ schema_version: 1, daily_records: [], settings: [] });
    backup.restoreBackup = vi.fn().mockRejectedValue(new TypeError('invalid envelope'));

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup);
    await engine.sync();

    expect(console.error).toHaveBeenCalledWith('[drive-sync]', expect.any(TypeError));
    const messages = reporter.sync.mock.calls.map(([m]) => m);
    expect(messages.some((m) => m.startsWith('✅'))).toBe(true);
    expect(messages.some((m) => m.startsWith('☁️ Restored'))).toBe(false);
  });

  it('driveSync/backup collaborators are not provided (legacy call site) → the empty-DB check never runs, db.daily_records.count() is never called', async () => {
    db = makeStatefulDb({ seed: [] });
    stubFetch();

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc);
    await engine.sync();

    expect(db.daily_records.count).not.toHaveBeenCalled();
  });

  it('integration (real backup.restoreBackup): restoring an empty local DB from a genuine Drive envelope makes the same sync run incremental instead of re-triggering the full-history backfill', async () => {
    const realDb = makeRestorableDb();
    stubFetch();
    const realBackup = createBackup(realDb);
    const remoteEnvelope = {
      schema_version: 1,
      exported_at: '2025-06-18T00:00:00.000Z',
      daily_records: [
        {
          date: '2025-06-17',
          original_steps: 5000,
          original_distance_km: 3.8,
          effective_steps: 5000,
          effective_distance_km: 3.8,
          is_overridden: false,
          override: null,
          synced_at: '2025-06-18T00:00:00.000Z',
        },
      ],
      settings: [{ key: 'initial_backfill_complete', value: true }],
    };
    driveSync.pull = vi.fn().mockResolvedValue(remoteEnvelope);

    const engine = createStepSync(createFitStepSource(auth, reporter), realDb, reporter, doc, driveSync, realBackup);
    await engine.sync();

    // The restored row actually landed in Dexie via the real restoreBackup transaction.
    expect(await realDb.daily_records.count()).toBeGreaterThan(0);
    // The sync completed as an incremental run — no full-history announcement,
    // proving _determineSyncWindows saw the restored rows/latch before running.
    const messages = reporter.sync.mock.calls.map(([m]) => m);
    expect(messages.some((m) => /full history/i.test(m))).toBe(false);
    expect(messages.some((m) => m.startsWith('✅'))).toBe(true);
  });
});

// ── Task 27: post-sync Drive auto-upload opt-out (drive_backup_enabled) ───────

describe('Task 27: post-sync Drive auto-upload opt-out', () => {
  let auth, db, reporter, doc;
  let driveSync, backup, prefs;

  const TODAY = new Date(2025, 5, 19);

  function stubFetch() {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ bucket: [] }),
      })
    );
  }

  /** Flush the fire-and-forget IIFE chain: pref read → buildBackup → push. */
  async function flush() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    auth = { getAccessToken: vi.fn().mockReturnValue('tok-abc') };
    reporter = {
      sync: vi.fn(),
      db: vi.fn(),
      auth: vi.fn(),
    };
    doc = { getElementById: vi.fn().mockReturnValue(null) };
    driveSync = { push: vi.fn().mockResolvedValue(undefined) };
    backup = {
      buildBackup: vi.fn().mockResolvedValue({ schema_version: 1, daily_records: [], settings: [] }),
      hasUnpushedChanges: vi.fn().mockResolvedValue(true),
      markPushed: vi.fn().mockResolvedValue(undefined),
    };
    prefs = {
      getDriveBackupEnabled: vi.fn().mockResolvedValue(true),
      setDriveBackupEnabled: vi.fn(),
      setLastDriveSync: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('toggle OFF → the post-sync hook skips the push entirely — buildBackup is NOT called', async () => {
    db = makeStatefulDb({ seed: [{ date: '2025-06-15' }], flag: { key: 'initial_backfill_complete', value: true } });
    stubFetch();
    prefs.getDriveBackupEnabled.mockResolvedValue(false);

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup, prefs);
    await engine.sync();
    await flush();

    expect(prefs.getDriveBackupEnabled).toHaveBeenCalledTimes(1);
    expect(backup.buildBackup).not.toHaveBeenCalled();
    expect(driveSync.push).not.toHaveBeenCalled();
  });

  it('toggle ON → the post-sync hook builds the backup and pushes with the silent flag', async () => {
    db = makeStatefulDb({ seed: [{ date: '2025-06-15' }], flag: { key: 'initial_backfill_complete', value: true } });
    stubFetch();

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup, prefs);
    await engine.sync();
    await flush();

    expect(prefs.getDriveBackupEnabled).toHaveBeenCalledTimes(1);
    expect(backup.buildBackup).toHaveBeenCalledTimes(1);
    expect(driveSync.push).toHaveBeenCalledTimes(1);
    expect(driveSync.push).toHaveBeenCalledWith(
      expect.objectContaining({ schema_version: 1 }),
      { silent: true }
    );
  });

  it('a skipped Drive push does not refresh metadata or mark the backup pushed', async () => {
    db = makeStatefulDb({ seed: [{ date: '2025-06-15' }], flag: { key: 'initial_backfill_complete', value: true } });
    stubFetch();
    driveSync.push.mockResolvedValue({ skipped: true });

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup, prefs);
    await engine.sync();
    await flush();

    expect(prefs.setLastDriveSync).not.toHaveBeenCalled();
    expect(backup.markPushed).not.toHaveBeenCalled();
  });

  it('no prefs collaborator injected → defaults to enabled and still pushes (backward compatible)', async () => {
    db = makeStatefulDb({ seed: [{ date: '2025-06-15' }], flag: { key: 'initial_backfill_complete', value: true } });
    stubFetch();

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup);
    await engine.sync();
    await flush();

    expect(backup.buildBackup).toHaveBeenCalledTimes(1);
    expect(driveSync.push).toHaveBeenCalledTimes(1);
  });
});

// ── Task 28: post-sync upload + concurrent-push coalescing ───────────────────

describe('Task 28: post-sync upload dirty-check + coalescing', () => {
  let auth, db, reporter, doc;
  let driveSync, prefs;
  let backup;

  const TODAY = new Date(2025, 5, 19);

  const emptyBucket = () => ({
    ok: true,
    json: async () => ({ bucket: [] }),
  });
  const dayBucket = (y, m, d) => ({
    ok: true,
    json: async () => ({
      bucket: [{ startTimeMillis: String(new Date(y, m, d).getTime()), dataset: [] }],
    }),
  });

  /** Flush the fire-and-forget hook chain: enabled → buildBackup → push → markPushed. */
  async function flush(rounds = 10) {
    for (let i = 0; i < rounds; i += 1) await Promise.resolve();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    auth = { getAccessToken: vi.fn().mockReturnValue('tok-abc') };
    reporter = {
      sync: vi.fn(),
      db: vi.fn(),
      auth: vi.fn(),
    };
    doc = { getElementById: vi.fn().mockReturnValue(null) };
    driveSync = { push: vi.fn().mockResolvedValue(undefined) };
    prefs = {
      getDriveBackupEnabled: vi.fn().mockResolvedValue(true),
      setDriveBackupEnabled: vi.fn(),
      setLastDriveSync: vi.fn(),
    };
    db = makeStatefulDb({
      seed: [seedRow('2025-06-15')],
      flag: { key: BACKFILL_COMPLETE_KEY, value: true },
    });
    backup = createBackup(db);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('each enabled sync uploads a fresh backup, even when the DB is unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyBucket()));
    const buildSpy = vi.spyOn(backup, 'buildBackup');

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup, prefs);
    await engine.sync();
    await flush();
    expect(driveSync.push).toHaveBeenCalledTimes(1);
    expect(buildSpy).toHaveBeenCalledTimes(1);

    // Second sync — empty bucket, zero new rows, but the cloud timestamp refreshes.
    await engine.sync();
    await flush();
    expect(driveSync.push).toHaveBeenCalledTimes(2);
    expect(buildSpy).toHaveBeenCalledTimes(2);
    expect(prefs.setLastDriveSync).toHaveBeenCalledTimes(2);
    expect(prefs.setLastDriveSync).toHaveBeenLastCalledWith({
      at: TODAY.toISOString(),
      bytes: expect.any(Number),
    });
  });

  it('a changed DB triggers a new upload on the next sync', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyBucket()));

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup, prefs);
    await engine.sync();
    await flush();
    expect(driveSync.push).toHaveBeenCalledTimes(1);

    // DB gains a new day → signature changes → the next sync must upload again.
    await db.daily_records.bulkPut([seedRow('2025-06-20')]);
    await engine.sync();
    await flush();
    expect(driveSync.push).toHaveBeenCalledTimes(2);
  });

  it('overlapping syncs coalesce — a second post-sync push while one is in flight uploads only once', async () => {
    let resolvePush;
    const pendingPush = new Promise((res) => {
      resolvePush = res;
    });
    driveSync.push = vi.fn().mockReturnValue(pendingPush);

    // sync #1 adds 06-19, sync #2 adds 06-20 — BOTH dirty, only one upload.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(dayBucket(2025, 5, 19))
        .mockResolvedValueOnce(dayBucket(2025, 5, 20))
        .mockResolvedValue(emptyBucket())
    );

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup, prefs);
    await engine.sync();
    await flush();
    expect(driveSync.push).toHaveBeenCalledTimes(1);

    await engine.sync();
    await flush();
    expect(driveSync.push).toHaveBeenCalledTimes(1);

    resolvePush();
    await flush();
    expect(driveSync.push).toHaveBeenCalledTimes(1);
  });

  it('a failed push is never marked pushed — the next sync retries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyBucket()));
    driveSync.push = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup, prefs);
    await engine.sync();
    await flush();
    expect(driveSync.push).toHaveBeenCalledTimes(1);

    await engine.sync();
    await flush();
    expect(driveSync.push).toHaveBeenCalledTimes(2);
  });

  it('toggle OFF → the automatic backup is skipped', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyBucket()));
    prefs.getDriveBackupEnabled.mockResolvedValue(false);
    const buildSpy = vi.spyOn(backup, 'buildBackup');

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup, prefs);
    await engine.sync();
    await flush();

    expect(prefs.getDriveBackupEnabled).toHaveBeenCalledTimes(1);
    expect(buildSpy).not.toHaveBeenCalled();
    expect(driveSync.push).not.toHaveBeenCalled();
  });

  it('no prefs collaborator injected → defaults to enabled and pushes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyBucket()));

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, doc, driveSync, backup);
    await engine.sync();
    await flush();

    expect(driveSync.push).toHaveBeenCalledTimes(1);
  });
});

describe('Task ST-010-2: _upsertChunk persists hourly_steps', () => {
  let db;

  function makeApiRecord(overrides = {}) {
    return {
      date: '2025-06-15',
      original_steps: 5000,
      original_distance_km: 3.81,
      effective_steps: 5000,
      effective_distance_km: 3.81,
      synced_at: new Date().toISOString(),
      hourly_steps: new Array(24).fill(0),
      ...overrides,
    };
  }

  function makeExistingRow(overrides = {}) {
    return {
      date: '2025-06-15',
      original_steps: 3000,
      original_distance_km: 2.286,
      effective_steps: 3000,
      effective_distance_km: 2.286,
      is_overridden: false,
      override: null,
      synced_at: '2025-01-01T00:00:00.000Z',
      hourly_steps: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    db = {
      daily_records: {
        bulkGet: vi.fn(),
        bulkPut: vi.fn().mockResolvedValue(undefined),
      },
      transaction: vi
        .fn()
        .mockImplementation(async (_mode, _table, callback) => callback()),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores hourly_steps on a new (absent) row', async () => {
    const hourlySteps = Array.from({ length: 24 }, (_, i) => i * 10);
    const record = makeApiRecord({ hourly_steps: hourlySteps });
    db.daily_records.bulkGet.mockResolvedValue([undefined]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows[0].hourly_steps).toEqual(hourlySteps);
  });

  it('refreshes hourly_steps on a non-overridden existing row', async () => {
    const newHourly = new Array(24).fill(50);
    const existing = makeExistingRow({ hourly_steps: null });
    const record = makeApiRecord({ hourly_steps: newHourly });
    db.daily_records.bulkGet.mockResolvedValue([existing]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows[0].hourly_steps).toEqual(newHourly);
  });

  it('refreshes hourly_steps on an is_overridden: true row without changing effective_steps', async () => {
    const newHourly = new Array(24).fill(5);
    const existing = makeExistingRow({
      effective_steps: 6000,
      is_overridden: true,
      override: { steps: 6000 },
      hourly_steps: null,
    });
    const record = makeApiRecord({ original_steps: 5000, hourly_steps: newHourly });
    db.daily_records.bulkGet.mockResolvedValue([existing]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows[0].hourly_steps).toEqual(newHourly);
    expect(rows[0].effective_steps).toBe(6000); // user override unchanged
    expect(rows[0].is_overridden).toBe(true);   // flag unchanged
  });

  it('stores null hourly_steps when record carries null', async () => {
    const record = makeApiRecord({ hourly_steps: null });
    db.daily_records.bulkGet.mockResolvedValue([undefined]);

    await _upsertChunk(db, [record]);

    const [rows] = db.daily_records.bulkPut.mock.calls[0];
    expect(rows[0].hourly_steps).toBeNull();
  });
});

describe('Task ST-010-2: Hourly fetch in sync() orchestrator', () => {
  const TODAY = new Date(2025, 5, 15, 9, 0, 0, 0);
  let auth, db, reporter;

  /** Minimal ok fetch response carrying an empty bucket list. */
  function emptyOk() {
    return { ok: true, status: 200, json: async () => ({ bucket: [] }) };
  }

  /** A non-ok response with the given HTTP status. */
  function failResponse(status) {
    return {
      ok: false,
      status,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: async () => ({}),
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    auth = { getAccessToken: vi.fn().mockReturnValue('tok-abc') };
    reporter = { db: vi.fn(), auth: vi.fn(), sync: vi.fn(), status: vi.fn() };
    document.body.innerHTML = '<button id="sync-btn">Sync Steps</button>';
    db = makeStatefulDb({
      seed: [seedRow('2013-01-01'), seedRow('2025-06-12')],
      flag: { key: BACKFILL_COMPLETE_KEY, value: true },
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('reporter.status is called with "⏳ Fetching hourly step data…" before the second API call', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyOk()));

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    expect(reporter.status).toHaveBeenCalledWith('⏳ Fetching hourly step data…');
  });

  it('reporter.status is emitted before the second fetch begins — not after', async () => {
    const callOrder = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const body = JSON.parse(init.body);
        const isHourly = body.bucketByTime.durationMillis === HOURLY_BUCKET_MS;
        callOrder.push(isHourly ? 'hourly-fetch' : 'daily-fetch');
        return emptyOk();
      })
    );
    reporter.status.mockImplementation((msg) => callOrder.push(`status:${msg}`));

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    const statusIdx = callOrder.findIndex((e) => e.startsWith('status:⏳ Fetching hourly'));
    const hourlyFetchIdx = callOrder.findIndex((e) => e === 'hourly-fetch');
    expect(statusIdx).toBeGreaterThanOrEqual(0);
    expect(hourlyFetchIdx).toBeGreaterThan(statusIdx);
  });

  it('hourly call HTTP error → all rows in chunk get hourly_steps: null; sync completes with ✅', async () => {
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        callCount += 1;
        const body = JSON.parse(init.body);
        const isHourly = body.bucketByTime.durationMillis === HOURLY_BUCKET_MS;
        if (isHourly) return failResponse(503);
        return emptyOk();
      })
    );

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    expect(lastSyncMessageFor(reporter)).toMatch(/^✅/);
    expect(console.error).toHaveBeenCalledWith(
      '[steps] hourly fetch failed',
      expect.any(Error)
    );
  });

  it('hourly call network failure (fetch throws) → hourly_steps: null; sync completes with ✅', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const body = JSON.parse(init.body);
        const isHourly = body.bucketByTime.durationMillis === HOURLY_BUCKET_MS;
        if (isHourly) throw new TypeError('Network error');
        return emptyOk();
      })
    );

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    expect(lastSyncMessageFor(reporter)).toMatch(/^✅/);
    expect(console.error).toHaveBeenCalledWith(
      '[steps] hourly fetch failed',
      expect.any(TypeError)
    );
  });

  it('hourly call failure does not abort the sync — subsequent chunks are still processed', async () => {
    // Use a range that produces at least 2 chunks.
    db = makeStatefulDb({
      seed: [seedRow('2013-01-01'), seedRow('2024-10-01')],
      flag: { key: BACKFILL_COMPLETE_KEY, value: true },
    });
    let dailyFetches = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const body = JSON.parse(init.body);
        const isHourly = body.bucketByTime.durationMillis === HOURLY_BUCKET_MS;
        if (isHourly) return failResponse(503);
        dailyFetches += 1;
        return emptyOk();
      })
    );

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    // All daily chunks should have been fetched despite hourly failures.
    expect(dailyFetches).toBeGreaterThan(1);
    expect(lastSyncMessageFor(reporter)).toMatch(/^✅/);
  });
});

describe('Task 16: parallel daily + hourly fetches in sync()', () => {
  const TODAY = new Date(2025, 5, 15, 9, 0, 0, 0);
  let auth, db, reporter;

  /** Minimal ok fetch response carrying an empty bucket list. */
  function emptyOk() {
    return { ok: true, status: 200, json: async () => ({ bucket: [] }) };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    auth = { getAccessToken: vi.fn().mockReturnValue('tok-abc') };
    reporter = { db: vi.fn(), auth: vi.fn(), sync: vi.fn(), status: vi.fn() };
    document.body.innerHTML = '<button id="sync-btn">Sync Steps</button>';
    db = makeStatefulDb({
      seed: [seedRow('2013-01-01'), seedRow('2025-06-12')],
      flag: { key: BACKFILL_COMPLETE_KEY, value: true },
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('fires daily and hourly fetches in parallel — hourly is fired while daily is still pending', async () => {
    const fired = [];
    let resolveDaily;

    vi.stubGlobal('fetch', vi.fn((_url, init) => {
      const body = JSON.parse(init.body);
      const isHourly = body.bucketByTime.durationMillis === HOURLY_BUCKET_MS;
      if (isHourly) {
        fired.push('hourly');
        return Promise.resolve(emptyOk());
      }
      fired.push('daily');
      return new Promise((resolve) => {
        resolveDaily = () => resolve(emptyOk());
      });
    }));

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    const syncP = engine.sync();

    // Flush microtasks until both fetches are in flight, or bail after 30 ticks
    for (let i = 0; i < 30; i++) {
      await Promise.resolve();
      if (fired.includes('daily') && fired.includes('hourly')) break;
    }

    // With parallel execution hourly fires while daily is still pending.
    // With sequential (current) code, hourly never fires until daily resolves.
    expect(fired).toContain('daily');
    expect(fired).toContain('hourly');

    resolveDaily?.();
    await syncP;
  });

  it('hourly failure during parallel fetch still sets hourly_steps: null and sync completes with ✅', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      const isHourly = body.bucketByTime.durationMillis === HOURLY_BUCKET_MS;
      if (isHourly) {
        return { ok: false, status: 503, headers: { get: vi.fn().mockReturnValue(null) }, json: async () => ({}) };
      }
      return emptyOk();
    }));

    const engine = createStepSync(createFitStepSource(auth, reporter), db, reporter, document);
    await engine.sync();

    const lastMsg = reporter.sync.mock.calls
      .map((c) => c[0])
      .filter(Boolean)
      .at(-1);
    expect(lastMsg).toMatch(/^✅/);
    expect(console.error).toHaveBeenCalledWith('[steps] hourly fetch failed', expect.any(Error));
  });
});

// ── ST-016: StepSource seam ───────────────────────────────────────────────────

describe('ST-016: _toDailyRecords — DayReadings to daily_records rows', () => {
  it('maps a reading with measured distance onto original_* and effective_* alike', () => {
    const [record] = _toDailyRecords([
      { date: '2025-06-15', steps: 8000, distanceKm: 6.1, hourlySteps: null },
    ]);
    expect(record).toEqual({
      date: '2025-06-15',
      original_steps: 8000,
      original_distance_km: 6.1,
      effective_steps: 8000,
      effective_distance_km: 6.1,
      hourly_steps: null,
      synced_at: expect.any(String),
    });
    expect(Number.isFinite(new Date(record.synced_at).getTime())).toBe(true);
  });

  it('estimates distance as steps × STEP_TO_KM (3 dp) when the source has none', () => {
    const [record] = _toDailyRecords([{ date: '2025-06-15', steps: 8000, distanceKm: null, hourlySteps: null }]);
    const estimate = Number((8000 * STEP_TO_KM).toFixed(3));
    expect(record.original_distance_km).toBe(estimate);
    expect(record.effective_distance_km).toBe(estimate);
  });

  it('keeps a measured 0 km as 0 — only null triggers the estimate', () => {
    const [record] = _toDailyRecords([{ date: '2025-06-15', steps: 500, distanceKm: 0, hourlySteps: null }]);
    expect(record.original_distance_km).toBe(0);
  });

  it('carries hourlySteps through as hourly_steps, defaulting a missing value to null', () => {
    const hourly = new Array(24).fill(0);
    hourly[8] = 1200;
    const [withHourly, withoutHourly] = _toDailyRecords([
      { date: '2025-06-15', steps: 1200, distanceKm: 1, hourlySteps: hourly },
      { date: '2025-06-16', steps: 0, distanceKm: null },
    ]);
    expect(withHourly.hourly_steps).toBe(hourly);
    expect(withoutHourly.hourly_steps).toBeNull();
  });

  it('returns an empty array for no readings', () => {
    expect(_toDailyRecords([])).toEqual([]);
  });
});

describe('ST-016: sync() depends only on the StepSource port', () => {
  const TODAY = new Date(2025, 5, 15, 9, 0, 0, 0);
  let reporter;

  /** A StepSource that never touches fetch: one reading per chunk start day. */
  function makeFakeSource(overrides = {}) {
    return {
      label: 'Fake Health',
      notReadyMessage: '🔑 Grant Fake Health access first',
      accessLostMessage: 'Fake Health access was revoked — grant it again',
      isReady: vi.fn(() => true),
      fetchDays: vi.fn(async (chunk) => [
        { date: _formatLocalDate(chunk.startMs), steps: 4200, distanceKm: null, hourlySteps: null },
      ]),
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('fetch must not be called'); }));
    reporter = { db: vi.fn(), auth: vi.fn(), sync: vi.fn(), status: vi.fn() };
    document.body.innerHTML = '<button id="sync-btn">Sync Steps</button>';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('runs a full incremental sync through fetchDays without any fetch', async () => {
    const db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-06-12')] });
    const source = makeFakeSource();

    await createStepSync(source, db, reporter, document).sync();

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(source.fetchDays).toHaveBeenCalledWith(
      { startMs: new Date(2025, 5, 9).getTime(), endMs: new Date(2025, 5, 16).getTime() },
      { index: 1, total: 1, phase: PHASE_INCREMENTAL }
    );
    const stored = db._rows.get('2025-06-09');
    expect(stored.original_steps).toBe(4200);
    expect(stored.original_distance_km).toBe(Number((4200 * STEP_TO_KM).toFixed(3)));
    expect(lastSyncMessageFor(reporter)).toMatch(/^✅ Synced 7 days/);
  });

  it('shows the source\'s notReadyMessage and never fetches when the source is not ready', async () => {
    const db = makeStatefulDb();
    const source = makeFakeSource({ isReady: () => false });

    await createStepSync(source, db, reporter, document).sync();

    expect(source.fetchDays).not.toHaveBeenCalled();
    expect(lastSyncMessageFor(reporter)).toBe('🔑 Grant Fake Health access first');
  });

  it('renders classified failures with the source label', async () => {
    const db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-06-12')] });
    const source = makeFakeSource({
      fetchDays: vi.fn(async (_chunk, { index, total, phase }) => {
        throw syncFailure({ kind: FAILURE_HTTP_ERROR, status: 403, index, total, phase });
      }),
    });

    await createStepSync(source, db, reporter, document).sync();

    expect(lastSyncMessageFor(reporter)).toBe(
      '❌ Sync stopped at chunk 1/1 — Fake Health returned 403. 0 days saved; click Sync Steps to resume.'
    );
  });

  it('renders access loss with the source\'s accessLostMessage', async () => {
    const db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-06-12')] });
    const source = makeFakeSource({
      fetchDays: vi.fn(async (_chunk, { index, total, phase }) => {
        throw syncFailure({ kind: FAILURE_AUTH_EXPIRED, status: null, index, total, phase });
      }),
    });

    await createStepSync(source, db, reporter, document).sync();

    expect(lastSyncMessageFor(reporter)).toBe(
      '🔑 Fake Health access was revoked — grant it again, then click Sync Steps to continue (history synced back to 2013-01-01).'
    );
  });

  it('awaits an asynchronous isReady() (Health Connect checks permissions asynchronously)', async () => {
    const db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-06-12')] });
    const notReady = makeFakeSource({ isReady: vi.fn(async () => false) });

    await createStepSync(notReady, db, reporter, document).sync();

    expect(notReady.fetchDays).not.toHaveBeenCalled();
    expect(lastSyncMessageFor(reporter)).toBe('🔑 Grant Fake Health access first');

    const ready = makeFakeSource({ isReady: vi.fn(async () => true) });
    await createStepSync(ready, db, reporter, document).sync();
    expect(ready.fetchDays).toHaveBeenCalledTimes(1);
  });

  it('an overlapping sync() is ignored even while an async isReady() is pending', async () => {
    const db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-06-12')] });
    const source = makeFakeSource({ isReady: vi.fn(async () => true) });
    const engine = createStepSync(source, db, reporter, document);

    await Promise.all([engine.sync(), engine.sync()]);

    expect(source.isReady).toHaveBeenCalledTimes(1);
    expect(source.fetchDays).toHaveBeenCalledTimes(1);
  });

  it('a not-ready source leaves the button untouched and a later sync can still run', async () => {
    const db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-06-12')] });
    let ready = false;
    const source = makeFakeSource({ isReady: vi.fn(async () => ready) });
    const engine = createStepSync(source, db, reporter, document);
    const btn = document.getElementById('sync-btn');

    await engine.sync();
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Sync Steps');

    ready = true;
    await engine.sync();
    expect(source.fetchDays).toHaveBeenCalledTimes(1);
  });

  it('a rejecting isReady() is treated as not ready and logged', async () => {
    const db = makeStatefulDb();
    const failure = new Error('plugin gone');
    const source = makeFakeSource({ isReady: vi.fn(async () => { throw failure; }) });

    await createStepSync(source, db, reporter, document).sync();

    expect(source.fetchDays).not.toHaveBeenCalled();
    expect(lastSyncMessageFor(reporter)).toBe('🔑 Grant Fake Health access first');
    expect(console.error).toHaveBeenCalledWith('[steps]', failure);
  });

  it('renders a source-error failure as "<label> could not be read"', async () => {
    const db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-06-12')] });
    const source = makeFakeSource({
      fetchDays: vi.fn(async (_chunk, { index, total, phase }) => {
        throw syncFailure({ kind: FAILURE_SOURCE_ERROR, status: null, index, total, phase });
      }),
    });

    await createStepSync(source, db, reporter, document).sync();

    expect(lastSyncMessageFor(reporter)).toBe(
      '❌ Sync stopped at chunk 1/1 — Fake Health data could not be read. 0 days saved; click Sync Steps to resume.'
    );
  });

  it('names the source in the full-history status message', async () => {
    const db = makeStatefulDb();
    const source = makeFakeSource();

    await createStepSync(source, db, reporter, document).sync();

    expect(reporter.sync.mock.calls.map((c) => c[0])).toContain(
      '⏳ Full history sync — fetching all Fake Health data since 2018-01-01. This can take several minutes; keep this tab open.'
    );
  });
});

describe('Configured sync anchor drives the backfill latch and messages (default 2018-01-01)', () => {
  const TODAY = new Date(2025, 5, 15, 9, 0, 0, 0);
  let reporter;

  /** Zero-filling fake source: one reading per day in every chunk, like Fit. */
  function makeZeroFillSource() {
    return {
      label: 'Google Fit',
      notReadyMessage: '🔑 Connect your Google Account first',
      accessLostMessage: 'Session expired — reconnect your Google Account',
      isReady: () => true,
      fetchDays: vi.fn(async ({ startMs, endMs }) => {
        const days = [];
        for (let d = new Date(startMs); d.getTime() < endMs; d = _addDays(d, 1)) {
          days.push({ date: _formatLocalDate(d.getTime()), steps: 0, distanceKm: null, hourlySteps: null });
        }
        return days;
      }),
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    reporter = { db: vi.fn(), auth: vi.fn(), sync: vi.fn(), status: vi.fn() };
    document.body.innerHTML = '<button id="sync-btn">Sync Steps</button>';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('a first full sync to the default anchor latches the backfill and reports it complete', async () => {
    const db = makeStatefulDb();

    await createStepSync(makeZeroFillSource(), db, reporter, document).sync();

    const msgs = reporter.sync.mock.calls.map((c) => c[0]);
    expect(msgs[0]).toBe(
      '⏳ Full history sync — fetching all Google Fit data since 2018-01-01. This can take several minutes; keep this tab open.'
    );
    expect(msgs.at(-1)).toMatch(/— full history complete back to 2018-01-01\. Future syncs will be fast\.$/);
    expect(msgs.at(-1)).not.toContain('continue the backfill');
    expect(db.settings.put).toHaveBeenCalledWith({ key: BACKFILL_COMPLETE_KEY, value: true });
  });

  it('a user-configured anchor is used in both messages', async () => {
    const db = makeStatefulDb({ syncAnchor: '2024-03-01' });

    await createStepSync(makeZeroFillSource(), db, reporter, document).sync();

    const msgs = reporter.sync.mock.calls.map((c) => c[0]);
    expect(msgs[0]).toContain('data since 2024-03-01.');
    expect(msgs.at(-1)).toContain('full history complete back to 2024-03-01.');
  });
});

describe('ST-020: post-sync Drive upload respects the primary device', () => {
  const TODAY = new Date(2025, 5, 19);
  let reporter, doc, driveSync, backup, prefs;

  const source = () => ({
    label: 'Fake',
    notReadyMessage: '🔑 x',
    accessLostMessage: 'x',
    isReady: () => true,
    fetchDays: vi.fn(async () => []),
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    reporter = { sync: vi.fn(), db: vi.fn(), auth: vi.fn() };
    doc = { getElementById: vi.fn().mockReturnValue(null) };
    driveSync = { push: vi.fn().mockResolvedValue(undefined) };
    backup = {
      buildBackup: vi.fn().mockResolvedValue({ schema_version: 1, daily_records: [], settings: [] }),
      markPushed: vi.fn().mockResolvedValue(undefined),
    };
    prefs = { getDriveBackupEnabled: vi.fn().mockResolvedValue(true), setLastDriveSync: vi.fn() };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const run = async (primaryDevice) => {
    const db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-06-15')], flag: true });
    await createStepSync(source(), db, reporter, doc, driveSync, backup, prefs, primaryDevice).sync();
    await vi.waitFor(() => expect(prefs.getDriveBackupEnabled).toHaveBeenCalled());
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  };

  it('skips the automatic upload when another device is primary — nothing is built or pushed', async () => {
    const primaryDevice = { otherPrimary: vi.fn().mockResolvedValue({ id: 'app', label: 'Android app', since: 'x' }) };

    await run(primaryDevice);

    expect(primaryDevice.otherPrimary).toHaveBeenCalledTimes(1);
    expect(backup.buildBackup).not.toHaveBeenCalled();
    expect(driveSync.push).not.toHaveBeenCalled();
  });

  it('uploads as before when this device is primary or none is', async () => {
    const primaryDevice = { otherPrimary: vi.fn().mockResolvedValue(null) };

    await run(primaryDevice);

    await vi.waitFor(() => expect(driveSync.push).toHaveBeenCalledTimes(1));
  });

  it('does not ask about the primary when auto-upload is switched off', async () => {
    prefs.getDriveBackupEnabled.mockResolvedValue(false);
    const primaryDevice = { otherPrimary: vi.fn() };

    await run(primaryDevice);

    expect(primaryDevice.otherPrimary).not.toHaveBeenCalled();
  });

  it('without a primaryDevice collaborator (legacy wiring) uploads as before', async () => {
    await run(null);
    await vi.waitFor(() => expect(driveSync.push).toHaveBeenCalledTimes(1));
  });
});
