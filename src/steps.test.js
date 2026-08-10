import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  createStepSync,
  HISTORY_ANCHOR_DATE,
  CHUNK_DAYS,
  BUCKET_MS,
  SAFETY_BUFFER_DAYS,
  STEP_TO_KM,
  METRES_PER_KM,
  RETRY_BACKOFF_MS,
  MAX_RETRY_AFTER_MS,
  BACKFILL_COMPLETE_KEY,
  STEP_API_URL,
  PHASE_FULL_HISTORY,
  PHASE_INCREMENTAL,
  _localMidnight,
  _addDays,
  _formatLocalDate,
  _chunkWindow,
  _determineSyncWindows,
} from './steps.js';

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
      const result = createStepSync(auth, db, reporter, doc);
      expect(typeof result.sync).toBe('function');
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    });

    it('three-arg call — doc defaults to document without error', () => {
      expect(() => createStepSync(auth, db, reporter)).not.toThrow();
      const result = createStepSync(auth, db, reporter);
      expect(typeof result.sync).toBe('function');
    });

    it('isSyncing flag is closure-scoped and not exposed on the returned object', () => {
      const result = createStepSync(auth, db, reporter, doc);
      expect(result.isSyncing).toBeUndefined();
    });
  });

  // ── Decision-11 constants ──────────────────────────────────────────────────

  describe('Decision-11 constants', () => {
    it('HISTORY_ANCHOR_DATE resolves to local midnight on 2013-01-01', () => {
      expect(HISTORY_ANCHOR_DATE.getFullYear()).toBe(2013);
      expect(HISTORY_ANCHOR_DATE.getMonth()).toBe(0); // January
      expect(HISTORY_ANCHOR_DATE.getDate()).toBe(1);
      expect(HISTORY_ANCHOR_DATE.getHours()).toBe(0);
    });

    it('CHUNK_DAYS === 30', () => {
      expect(CHUNK_DAYS).toBe(30);
    });

    it('BUCKET_MS === 86_400_000', () => {
      expect(BUCKET_MS).toBe(86_400_000);
    });

    it('SAFETY_BUFFER_DAYS === 3', () => {
      expect(SAFETY_BUFFER_DAYS).toBe(3);
    });

    it('STEP_TO_KM === 0.000762', () => {
      expect(STEP_TO_KM).toBe(0.000762);
    });

    it('METRES_PER_KM === 1000', () => {
      expect(METRES_PER_KM).toBe(1000);
    });

    it('RETRY_BACKOFF_MS === 2000', () => {
      expect(RETRY_BACKOFF_MS).toBe(2000);
    });

    it('MAX_RETRY_AFTER_MS === 30_000', () => {
      expect(MAX_RETRY_AFTER_MS).toBe(30_000);
    });

    it("BACKFILL_COMPLETE_KEY === 'initial_backfill_complete'", () => {
      expect(BACKFILL_COMPLETE_KEY).toBe('initial_backfill_complete');
    });

    it('STEP_API_URL equals the full Google Fit aggregate endpoint', () => {
      expect(STEP_API_URL).toBe(
        'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate'
      );
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
  function makeDb({ oldest, latest, flagRow, settingsError } = {}) {
    const get = settingsError
      ? vi.fn().mockRejectedValue(settingsError)
      : vi.fn().mockResolvedValue(flagRow);
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
    expect(windows[0].startMs).toBe(_localMidnight(HISTORY_ANCHOR_DATE).getTime());
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

  it('oldest.date === HISTORY_ANCHOR_DATE with the flag absent → incremental window only', async () => {
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

    expect(backfill.startMs).toBe(_localMidnight(HISTORY_ANCHOR_DATE).getTime());
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

  it('src/db.js still declares DB_VERSION = 1 and no sync_meta store', () => {
    const dbContent = fs.readFileSync(path.resolve(__dirname, './db.js'), 'utf-8');
    expect(dbContent).toContain('export const DB_VERSION = 1;');
    expect(dbContent).not.toContain('sync_meta');
  });

  it('src/steps.js does not reference a sync_meta store or bump the schema', () => {
    const stepsContent = fs.readFileSync(
      path.resolve(__dirname, './steps.js'),
      'utf-8'
    );
    // No sync_meta table access (a doc comment naming it is fine), no schema work.
    expect(stepsContent).not.toMatch(/db\.sync_meta|['"]sync_meta['"]|sync_meta\s*:/);
    expect(stepsContent).not.toContain('DB_VERSION');
    expect(stepsContent).not.toContain('.version(');
  });

  it('sync() is still the untouched stub — this task does not orchestrate', async () => {
    const db = makeDb({ oldest: undefined, latest: undefined });
    const reporter = { db: vi.fn(), auth: vi.fn(), sync: vi.fn() };
    const auth = { getAccessToken: vi.fn() };

    const engine = createStepSync(auth, db, reporter, document);
    await engine.sync();

    expect(reporter.sync).not.toHaveBeenCalled();
    expect(auth.getAccessToken).not.toHaveBeenCalled();
  });
});
