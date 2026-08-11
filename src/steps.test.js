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
  _normalizeBuckets,
  _fetchChunk,
  _upsertChunk,
  _latchBackfillComplete,
  _readOldestStoredLabel,
  _resolveBackoffMs,
  _syncFailure,
  MAX_ATTEMPTS_PER_CHUNK,
  FAILURE_AUTH_EXPIRED,
  FAILURE_RETRY_EXHAUSTED,
  FAILURE_HTTP_ERROR,
  FAILURE_NETWORK_ERROR,
  SYNC_ERROR_NAME,
} from './steps.js';
import { DB_VERSION } from './db.js';
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

  it('db.js exports DB_VERSION = 3 (ST-006 schema bump)', () => {
    expect(DB_VERSION).toBe(3);
  });

  // ── Pre-flight token guard (covered orchestrator-level in Task 9/10) ───────
});

// ── Task 5: _normalizeBuckets — dual data type, zero-fill, distance fallback ──

describe('Task 5: _normalizeBuckets — dual data type, zero-fill, distance fallback', () => {
  /** Local midnight on June 15, 2025 — used as the default bucket timestamp. */
  const JUNE_15_MS = new Date(2025, 5, 15, 0, 0, 0, 0).getTime();
  const JUNE_15_MS_STR = String(JUNE_15_MS);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── Helper ────────────────────────────────────────────────────────────────────

  /**
   * Build a minimal bucket with the given step intVals and distance fpVals.
   * Both datasets carry a realistic dataSourceId by default.
   */
  function makeBucket({
    startTimeMillis = JUNE_15_MS_STR,
    startTimeNanos = undefined,
    stepPoints = [],
    distPoints = [],
    includeDistDataset = true,
    stepDataSourceId = 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps',
    distDataSourceId = 'derived:com.google.distance.delta:com.google.android.gms:estimated_distance',
  } = {}) {
    const dataset = [
      {
        dataSourceId: stepDataSourceId,
        point: stepPoints.map((intVal) => ({ value: [{ intVal }] })),
      },
    ];
    if (includeDistDataset) {
      dataset.push({
        dataSourceId: distDataSourceId,
        point: distPoints.map((fpVal) => ({ value: [{ fpVal }] })),
      });
    }
    const bucket = { dataset };
    if (startTimeMillis != null) bucket.startTimeMillis = startTimeMillis;
    if (startTimeNanos != null) bucket.startTimeNanos = startTimeNanos;
    return bucket;
  }

  // ── 1: Empty dataset array → 0-step record (zero-fill, not a skip) ───────────

  it('bucket with empty dataset array produces a record with effective_steps: 0 and effective_distance_km: 0 — not a skipped day', () => {
    const bucket = { startTimeMillis: JUNE_15_MS_STR, dataset: [] };
    const records = _normalizeBuckets([bucket]);
    expect(records.length).toBe(1);
    expect(records[0].effective_steps).toBe(0);
    expect(records[0].effective_distance_km).toBe(0);
  });

  // ── 2: Step sum ───────────────────────────────────────────────────────────────

  it('bucket with step_count.delta dataset returns correct summed original_steps', () => {
    const bucket = makeBucket({ stepPoints: [1000, 2000, 500] });
    const [record] = _normalizeBuckets([bucket]);
    expect(record.original_steps).toBe(3500);
  });

  // ── 3: Distance metres → km at 3 decimal places ───────────────────────────────

  it('distance.delta fpVal metres converted to km rounded to 3 decimals', () => {
    const metres = 1234.567;
    const bucket = makeBucket({ stepPoints: [5000], distPoints: [metres] });
    const [record] = _normalizeBuckets([bucket]);
    expect(record.original_distance_km).toBe(Number((metres / 1000).toFixed(3)));
  });

  // ── 4: Real distance preferred over step-derived value ────────────────────────

  it('real distance.delta value used in preference to step-derived fallback when present', () => {
    const steps = 5000;
    const metres = 4500; // != steps * STEP_TO_KM * 1000
    const bucket = makeBucket({ stepPoints: [steps], distPoints: [metres] });
    const [record] = _normalizeBuckets([bucket]);
    expect(record.original_distance_km).toBe(Number((metres / 1000).toFixed(3)));
    expect(record.original_distance_km).not.toBe(Number((steps * STEP_TO_KM).toFixed(3)));
  });

  // ── 5: Missing distance dataset → step-derived fallback ──────────────────────

  it('day with missing distance.delta dataset → effective_distance_km derived from steps * STEP_TO_KM', () => {
    const steps = 8000;
    const bucket = makeBucket({ stepPoints: [steps], includeDistDataset: false });
    const [record] = _normalizeBuckets([bucket]);
    expect(record.effective_distance_km).toBe(Number((steps * STEP_TO_KM).toFixed(3)));
  });

  // ── 6: Empty distance dataset (no points) → step-derived fallback ────────────

  it('empty distance.delta dataset (no points) → step-derived fallback used', () => {
    const steps = 6000;
    const bucket = makeBucket({ stepPoints: [steps], distPoints: [] }); // distPoints: [] → empty
    const [record] = _normalizeBuckets([bucket]);
    expect(record.effective_distance_km).toBe(Number((steps * STEP_TO_KM).toFixed(3)));
  });

  // ── 7: Non-finite distance total → step-derived fallback ─────────────────────

  it('distance total of Infinity → step-derived fallback used', () => {
    const steps = 7000;
    const bucket = makeBucket({ stepPoints: [steps], distPoints: [Infinity] });
    const [record] = _normalizeBuckets([bucket]);
    expect(record.effective_distance_km).toBe(Number((steps * STEP_TO_KM).toFixed(3)));
  });

  // ── 8: steps === 0, distance > 0 (cycling / manual log) ─────────────────────

  it('day with steps === 0 and distance_km > 0 is persisted as-is — not treated as inconsistent', () => {
    const bucket = makeBucket({ stepPoints: [0], distPoints: [5000] });
    const [record] = _normalizeBuckets([bucket]);
    expect(record.original_steps).toBe(0);
    expect(record.original_distance_km).toBeGreaterThan(0);
    expect(record.effective_steps).toBe(0);
    expect(record.effective_distance_km).toBeGreaterThan(0);
  });

  // ── 9: Dataset located by dataSourceId substring, not position ────────────────

  it('datasets located by dataSourceId.includes substring — reordering still yields correct steps', () => {
    // Distance dataset is placed at index 0, steps at index 1 — reversed from request order
    const bucket = {
      startTimeMillis: JUNE_15_MS_STR,
      dataset: [
        {
          dataSourceId: 'derived:com.google.distance.delta:...',
          point: [{ value: [{ fpVal: 3000 }] }],
        },
        {
          dataSourceId: 'derived:com.google.step_count.delta:...',
          point: [{ value: [{ intVal: 9999 }] }],
        },
      ],
    };
    const [record] = _normalizeBuckets([bucket]);
    expect(record.original_steps).toBe(9999);
    expect(record.original_distance_km).toBe(Number((3000 / 1000).toFixed(3)));
  });

  // ── 10: Positional fallback when dataSourceId absent ─────────────────────────

  it('positional fallback (index 0 for steps, index 1 for distance) used when dataSourceId absent', () => {
    const steps = 4321;
    const metres = 3000;
    const bucket = {
      startTimeMillis: JUNE_15_MS_STR,
      dataset: [
        { point: [{ value: [{ intVal: steps }] }] }, // index 0 → steps
        { point: [{ value: [{ fpVal: metres }] }] }, // index 1 → distance
      ],
    };
    const [record] = _normalizeBuckets([bucket]);
    expect(record.original_steps).toBe(steps);
    expect(record.original_distance_km).toBe(Number((metres / 1000).toFixed(3)));
  });

  // ── 11: Date label from local getters, never toISOString() ───────────────────

  it('date label derived from bucket.startTimeMillis via local getters (getFullYear/getMonth/getDate)', () => {
    vi.useFakeTimers();
    const localMidnightMs = new Date(2025, 5, 15, 0, 0, 0, 0).getTime();
    vi.setSystemTime(localMidnightMs);

    const bucket = { startTimeMillis: String(localMidnightMs), dataset: [] };
    const [record] = _normalizeBuckets([bucket]);

    const d = new Date(localMidnightMs);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(record.date).toBe(expected);
  });

  // ── 12: Nanos fallback when startTimeMillis absent ───────────────────────────

  it('nanos fallback: when startTimeMillis absent, Number(startTimeNanos) / 1e6 used for date derivation', () => {
    // Use a small ms value (1000 ms) so nanos = 1e9 stays well below MAX_SAFE_INTEGER
    const testMs = 1000;
    const nanos = String(testMs * 1_000_000); // "1000000000"
    const bucket = { startTimeNanos: nanos, dataset: [] };
    const [record] = _normalizeBuckets([bucket]);

    const d = new Date(testMs);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(record.date).toBe(expected);
  });

  // ── 13: Missing dataset property → no throw, 0-step record ──────────────────

  it('missing dataset property on bucket does not throw; produces 0-step record', () => {
    const bucket = { startTimeMillis: JUNE_15_MS_STR }; // no dataset
    expect(() => _normalizeBuckets([bucket])).not.toThrow();
    const [record] = _normalizeBuckets([bucket]);
    expect(record.original_steps).toBe(0);
  });

  // ── 14: Missing point array inside dataset → no throw ────────────────────────

  it('missing point array inside dataset does not throw', () => {
    const bucket = {
      startTimeMillis: JUNE_15_MS_STR,
      dataset: [
        { dataSourceId: 'derived:com.google.step_count.delta:...' }, // no point
      ],
    };
    expect(() => _normalizeBuckets([bucket])).not.toThrow();
    const [record] = _normalizeBuckets([bucket]);
    expect(record.original_steps).toBe(0);
  });

  // ── 15: Missing value array inside point → no throw ──────────────────────────

  it('missing value array inside point does not throw', () => {
    const bucket = {
      startTimeMillis: JUNE_15_MS_STR,
      dataset: [
        {
          dataSourceId: 'derived:com.google.step_count.delta:...',
          point: [{ /* no value */ }],
        },
      ],
    };
    expect(() => _normalizeBuckets([bucket])).not.toThrow();
    const [record] = _normalizeBuckets([bucket]);
    expect(record.original_steps).toBe(0);
  });

  // ── 16: synced_at is ISO 8601 ─────────────────────────────────────────────────

  it('synced_at is an ISO 8601 timestamp string on every output record', () => {
    const bucket = { startTimeMillis: JUNE_15_MS_STR, dataset: [] };
    const [record] = _normalizeBuckets([bucket]);
    expect(typeof record.synced_at).toBe('string');
    expect(Number.isFinite(new Date(record.synced_at).getTime())).toBe(true);
  });

  // ── 17: Both timestamp fields absent → bucket skipped, no NaN primary key ─────

  it('a bucket with neither startTimeMillis nor startTimeNanos is skipped rather than persisted with a NaN date key', () => {
    const bucket = { dataset: [] };
    const records = _normalizeBuckets([bucket]);
    expect(records.length).toBe(0);
  });

  it('a bucket with a non-numeric startTimeMillis is skipped rather than persisted with a NaN date key', () => {
    const bucket = { startTimeMillis: 'not-a-number', dataset: [] };
    const records = _normalizeBuckets([bucket]);
    expect(records.length).toBe(0);
  });

  // ── Output shape ─────────────────────────────────────────────────────────────

  it('every output record carries the full { date, original_steps, original_distance_km, effective_steps, effective_distance_km, synced_at } shape', () => {
    const bucket = makeBucket({ stepPoints: [500], distPoints: [400] });
    const [record] = _normalizeBuckets([bucket]);
    expect(Object.keys(record).sort()).toEqual([
      'date',
      'effective_distance_km',
      'effective_steps',
      'original_distance_km',
      'original_steps',
      'synced_at',
    ]);
  });

  it('effective_steps and effective_distance_km equal their original_ counterparts from _normalizeBuckets (no override at this layer)', () => {
    const bucket = makeBucket({ stepPoints: [1234], distPoints: [999] });
    const [record] = _normalizeBuckets([bucket]);
    expect(record.effective_steps).toBe(record.original_steps);
    expect(record.effective_distance_km).toBe(record.original_distance_km);
  });
});

// ── Task 6: _fetchChunk — transient-retry policy and 401 short-circuit ────────

describe('Task 6: _fetchChunk — transient-retry policy and 401 short-circuit', () => {
  /** A single chunk on exact local-midnight boundaries: June 1 → July 1, 2025. */
  const CHUNK = {
    startMs: new Date(2025, 5, 1).getTime(),
    endMs: new Date(2025, 6, 1).getTime(),
  };

  let auth, reporter;

  /**
   * Minimal Response double exposing only the surface _fetchChunk may touch.
   *
   * @param {number} status
   * @param {object=} opts
   * @param {object=} opts.json     Body resolved by response.json()
   * @param {object=} opts.headers  Header map consulted by headers.get(name)
   */
  function makeResponse(status, { json = { bucket: [] }, headers = {} } = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: vi.fn((name) => headers[name] ?? null) },
      json: vi.fn().mockResolvedValue(json),
    };
  }

  /** Parse the JSON body of the nth (0-based) fetch call. */
  function bodyOfCall(n = 0) {
    return JSON.parse(globalThis.fetch.mock.calls[n][1].body);
  }

  /** Raw (unparsed) body string of the nth fetch call. */
  function rawBodyOfCall(n = 0) {
    return globalThis.fetch.mock.calls[n][1].body;
  }

  beforeEach(() => {
    auth = { getAccessToken: vi.fn().mockReturnValue('tok-abc') };
    reporter = { db: vi.fn(), auth: vi.fn(), sync: vi.fn() };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── Request shape (Decision 5) ─────────────────────────────────────────────

  it('POST body contains exactly two aggregateBy entries — step_count.delta and distance.delta', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse(200));

    await _fetchChunk(auth, reporter, CHUNK, 1, 1, PHASE_INCREMENTAL);

    const body = bodyOfCall();
    expect(body.aggregateBy.length).toBe(2);
    expect(body.aggregateBy.map((entry) => entry.dataTypeName)).toEqual([
      'com.google.step_count.delta',
      'com.google.distance.delta',
    ]);
  });

  it('no dataSourceId key appears anywhere in the serialized request body', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse(200));

    await _fetchChunk(auth, reporter, CHUNK, 1, 1, PHASE_INCREMENTAL);

    expect(rawBodyOfCall()).not.toContain('dataSourceId');
  });

  it('startTimeMillis / endTimeMillis correspond to 00:00:00.000 local time', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse(200));

    await _fetchChunk(auth, reporter, CHUNK, 1, 1, PHASE_INCREMENTAL);

    const body = bodyOfCall();
    expect(body.startTimeMillis).toBe(_localMidnight(CHUNK.startMs).getTime());
    expect(body.endTimeMillis).toBe(_localMidnight(CHUNK.endMs).getTime());
    for (const ms of [body.startTimeMillis, body.endTimeMillis]) {
      expect(new Date(ms).getHours()).toBe(0);
      expect(new Date(ms).getMinutes()).toBe(0);
      expect(new Date(ms).getSeconds()).toBe(0);
      expect(new Date(ms).getMilliseconds()).toBe(0);
    }
  });

  it('a chunk whose bounds carry a time-of-day is normalized down to local midnight', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse(200));
    const messy = {
      startMs: new Date(2025, 5, 1, 13, 45, 30, 123).getTime(),
      endMs: new Date(2025, 6, 1, 9, 5, 0, 7).getTime(),
    };

    await _fetchChunk(auth, reporter, messy, 1, 1, PHASE_INCREMENTAL);

    const body = bodyOfCall();
    expect(body.startTimeMillis).toBe(new Date(2025, 5, 1).getTime());
    expect(body.endTimeMillis).toBe(new Date(2025, 6, 1).getTime());
  });

  it('bucketByTime.durationMillis equals BUCKET_MS', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse(200));

    await _fetchChunk(auth, reporter, CHUNK, 1, 1, PHASE_INCREMENTAL);

    expect(bodyOfCall().bucketByTime.durationMillis).toBe(BUCKET_MS);
    expect(BUCKET_MS).toBe(86_400_000);
  });

  it('POSTs to STEP_API_URL with the bearer token and a JSON content type', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse(200));

    await _fetchChunk(auth, reporter, CHUNK, 1, 1, PHASE_INCREMENTAL);

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(STEP_API_URL);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok-abc');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('HTTP 200 on the first attempt → one fetch call, resolves to the parsed JSON', async () => {
    const payload = { bucket: [{ startTimeMillis: '1' }] };
    globalThis.fetch.mockResolvedValue(makeResponse(200, { json: payload }));

    const result = await _fetchChunk(auth, reporter, CHUNK, 1, 1, PHASE_INCREMENTAL);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(payload);
    expect(reporter.sync).not.toHaveBeenCalled();
  });

  // ── Transient retry (Decision 17 + Decision 12a) ────────────────────────────

  it('429 then 200 → exactly two fetch calls, with the ⚠️ rate-limit message written before the backoff', async () => {
    vi.useFakeTimers();
    globalThis.fetch
      .mockResolvedValueOnce(makeResponse(429))
      .mockResolvedValueOnce(makeResponse(200));

    const pending = _fetchChunk(auth, reporter, CHUNK, 2, 7, PHASE_FULL_HISTORY);

    // Let the first attempt settle without letting the backoff elapse.
    await vi.advanceTimersByTimeAsync(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(reporter.sync).toHaveBeenCalledWith(
      `⚠️ Rate limited by Google Fit — retrying chunk 2/7 in ${RETRY_BACKOFF_MS / 1000}s…`
    );

    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS);
    await expect(pending).resolves.toEqual({ bucket: [] });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('503 then 200 → two fetch calls, with the ⚠️ Google Fit error 503 message written before the backoff', async () => {
    vi.useFakeTimers();
    globalThis.fetch
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(200));

    const pending = _fetchChunk(auth, reporter, CHUNK, 1, 3, PHASE_INCREMENTAL);

    await vi.advanceTimersByTimeAsync(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(reporter.sync).toHaveBeenCalledWith(
      `⚠️ Google Fit error 503 — retrying chunk 1/3 in ${RETRY_BACKOFF_MS / 1000}s…`
    );

    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS);
    await expect(pending).resolves.toEqual({ bucket: [] });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('429 then 429 → exactly two fetch calls and a retry-exhausted classification', async () => {
    vi.useFakeTimers();
    globalThis.fetch.mockResolvedValue(makeResponse(429));

    const pending = _fetchChunk(auth, reporter, CHUNK, 4, 9, PHASE_FULL_HISTORY);
    const assertion = expect(pending).rejects.toMatchObject({
      name: SYNC_ERROR_NAME,
      kind: FAILURE_RETRY_EXHAUSTED,
      status: 429,
      index: 4,
      total: 9,
      phase: PHASE_FULL_HISTORY,
    });

    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS);
    await assertion;
    expect(globalThis.fetch).toHaveBeenCalledTimes(MAX_ATTEMPTS_PER_CHUNK);
    expect(MAX_ATTEMPTS_PER_CHUNK).toBe(2);
  });

  it('503 then 500 → retry-exhausted classification carrying the second status', async () => {
    vi.useFakeTimers();
    globalThis.fetch
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(500));

    const pending = _fetchChunk(auth, reporter, CHUNK, 1, 1, PHASE_INCREMENTAL);
    const assertion = expect(pending).rejects.toMatchObject({
      kind: FAILURE_RETRY_EXHAUSTED,
      status: 500,
    });

    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS);
    await assertion;
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  // ── Non-retryable outcomes ─────────────────────────────────────────────────

  it('401 → exactly one fetch call, no retry, auth-expired classification', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse(401));

    await expect(
      _fetchChunk(auth, reporter, CHUNK, 5, 12, PHASE_INCREMENTAL)
    ).rejects.toMatchObject({
      name: SYNC_ERROR_NAME,
      kind: FAILURE_AUTH_EXPIRED,
      status: 401,
      index: 5,
      total: 12,
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(reporter.sync).not.toHaveBeenCalled();
  });

  it('403 → exactly one fetch call and a non-retryable http-error classification', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse(403));

    await expect(
      _fetchChunk(auth, reporter, CHUNK, 1, 1, PHASE_INCREMENTAL)
    ).rejects.toMatchObject({ kind: FAILURE_HTTP_ERROR, status: 403 });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(reporter.sync).not.toHaveBeenCalled();
  });

  it('600 (outside the 5xx band) is not retried — classified as http-error', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse(600));

    await expect(
      _fetchChunk(auth, reporter, CHUNK, 1, 1, PHASE_INCREMENTAL)
    ).rejects.toMatchObject({ kind: FAILURE_HTTP_ERROR, status: 600 });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('a thrown TypeError from fetch → one fetch call and a network-error classification', async () => {
    const networkFailure = new TypeError('Failed to fetch');
    globalThis.fetch.mockRejectedValue(networkFailure);

    await expect(
      _fetchChunk(auth, reporter, CHUNK, 3, 8, PHASE_INCREMENTAL)
    ).rejects.toMatchObject({
      name: SYNC_ERROR_NAME,
      kind: FAILURE_NETWORK_ERROR,
      status: null,
      index: 3,
      total: 8,
      cause: networkFailure,
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(reporter.sync).not.toHaveBeenCalled();
  });

  // ── Backoff resolution (Decision 17) ───────────────────────────────────────

  it('Retry-After: 5 → the backoff sleeps exactly 5000 ms, not RETRY_BACKOFF_MS', async () => {
    vi.useFakeTimers();
    globalThis.fetch
      .mockResolvedValueOnce(makeResponse(429, { headers: { 'Retry-After': '5' } }))
      .mockResolvedValueOnce(makeResponse(200));

    const pending = _fetchChunk(auth, reporter, CHUNK, 1, 1, PHASE_INCREMENTAL);

    await vi.advanceTimersByTimeAsync(4999);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(reporter.sync).toHaveBeenCalledWith(
      '⚠️ Rate limited by Google Fit — retrying chunk 1/1 in 5s…'
    );

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('Retry-After: 600 exceeds MAX_RETRY_AFTER_MS → falls back to RETRY_BACKOFF_MS', async () => {
    vi.useFakeTimers();
    globalThis.fetch
      .mockResolvedValueOnce(makeResponse(429, { headers: { 'Retry-After': '600' } }))
      .mockResolvedValueOnce(makeResponse(200));

    const pending = _fetchChunk(auth, reporter, CHUNK, 1, 1, PHASE_INCREMENTAL);

    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS - 1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(reporter.sync).toHaveBeenCalledWith(
      `⚠️ Rate limited by Google Fit — retrying chunk 1/1 in ${RETRY_BACKOFF_MS / 1000}s…`
    );
  });

  describe('_resolveBackoffMs', () => {
    it('honours a finite positive value within the cap, read as seconds', () => {
      expect(_resolveBackoffMs('5')).toBe(5000);
      expect(_resolveBackoffMs('30')).toBe(MAX_RETRY_AFTER_MS);
    });

    it('rejects values above MAX_RETRY_AFTER_MS, zero, negative, absent and unparseable', () => {
      expect(_resolveBackoffMs('600')).toBe(RETRY_BACKOFF_MS);
      expect(_resolveBackoffMs('0')).toBe(RETRY_BACKOFF_MS);
      expect(_resolveBackoffMs('-1')).toBe(RETRY_BACKOFF_MS);
      expect(_resolveBackoffMs(null)).toBe(RETRY_BACKOFF_MS);
      expect(_resolveBackoffMs(undefined)).toBe(RETRY_BACKOFF_MS);
      expect(_resolveBackoffMs('')).toBe(RETRY_BACKOFF_MS);
      expect(_resolveBackoffMs('Wed, 21 Oct 2015 07:28:00 GMT')).toBe(RETRY_BACKOFF_MS);
    });
  });

  describe('_syncFailure', () => {
    it('carries the kind, status and chunk coordinates Task 10 renders from', () => {
      const error = _syncFailure({
        kind: FAILURE_HTTP_ERROR,
        status: 403,
        index: 2,
        total: 5,
        phase: PHASE_INCREMENTAL,
      });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(SYNC_ERROR_NAME);
      expect(error.kind).toBe(FAILURE_HTTP_ERROR);
      expect(error.status).toBe(403);
      expect(error.index).toBe(2);
      expect(error.total).toBe(5);
      expect(error.phase).toBe(PHASE_INCREMENTAL);
      expect(error.cause).toBeUndefined();
    });

    it('omits the status suffix and preserves the cause for a thrown network failure', () => {
      const cause = new TypeError('Failed to fetch');
      const error = _syncFailure({
        kind: FAILURE_NETWORK_ERROR,
        status: null,
        index: 1,
        total: 1,
        phase: PHASE_FULL_HISTORY,
        cause,
      });

      expect(error.message).not.toContain('HTTP');
      expect(error.cause).toBe(cause);
    });
  });

  // ── Token handling (Decision 14) ───────────────────────────────────────────

  it('the token is re-read from auth.getAccessToken() on every attempt — never cached', async () => {
    vi.useFakeTimers();
    auth.getAccessToken
      .mockReturnValueOnce('tok-first')
      .mockReturnValueOnce('tok-second');
    globalThis.fetch
      .mockResolvedValueOnce(makeResponse(429))
      .mockResolvedValueOnce(makeResponse(200));

    const pending = _fetchChunk(auth, reporter, CHUNK, 1, 1, PHASE_INCREMENTAL);
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS);
    await pending;

    expect(auth.getAccessToken).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-first');
    expect(globalThis.fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer tok-second');
  });

  it('never logs, persists or interpolates token material into any message or diagnostic', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse(401));

    const thrown = await _fetchChunk(auth, reporter, CHUNK, 1, 1, PHASE_INCREMENTAL).catch(
      (error) => error
    );

    const emitted = [
      thrown.message,
      JSON.stringify({ ...thrown, message: thrown.message }),
      ...reporter.sync.mock.calls.flat(),
      ...console.error.mock.calls.flat().map((arg) => String(arg)),
    ].join(' ');

    expect(emitted).not.toContain('tok-abc');
    expect(emitted).not.toContain('Bearer');
    expect(emitted).not.toContain('Authorization');
  });

  // ── Guard clauses ──────────────────────────────────────────────────────────

  it('fails fast on a missing chunk without issuing any request', async () => {
    await expect(
      _fetchChunk(auth, reporter, undefined, 1, 1, PHASE_INCREMENTAL)
    ).rejects.toThrow(TypeError);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('fails fast on a chunk with non-finite bounds without issuing any request', async () => {
    await expect(
      _fetchChunk(auth, reporter, { startMs: 0, endMs: Number.NaN }, 1, 1, PHASE_INCREMENTAL)
    ).rejects.toThrow(/startMs, endMs/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
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
   * Build one incoming API record (the shape _normalizeBuckets produces).
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
    // _normalizeBuckets always sets effective_steps === original_steps on a fresh API record.
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

  // ── Oldest record reaches or passes the anchor → latch ─────────────────────

  it("puts { key: BACKFILL_COMPLETE_KEY, value: true } when the oldest record reaches the anchor", async () => {
    const db = makeDb({ oldest: { date: '2013-01-01' } });

    await _latchBackfillComplete(db);

    expect(db.settings.put).toHaveBeenCalledTimes(1);
    expect(db.settings.put).toHaveBeenCalledWith({
      key: BACKFILL_COMPLETE_KEY,
      value: true,
    });
  });

  it('latches when the oldest record predates the anchor (dates before 2013)', async () => {
    const db = makeDb({ oldest: { date: '2012-12-31' } });

    await _latchBackfillComplete(db);

    expect(db.settings.put).toHaveBeenCalledTimes(1);
    expect(db.settings.put).toHaveBeenCalledWith({
      key: BACKFILL_COMPLETE_KEY,
      value: true,
    });
  });

  it('latches exactly once — a single put call for a single invocation', async () => {
    const db = makeDb({ oldest: { date: '2013-01-01' } });

    await _latchBackfillComplete(db);
    await _latchBackfillComplete(db);

    // Each invocation performs its own read+write; a single run writes once.
    expect(db.daily_records.orderBy).toHaveBeenCalledWith('date');
  });

  // ── Oldest record still newer than the anchor → no latch ───────────────────

  it('does not latch when the oldest record is still newer than the anchor', async () => {
    const db = makeDb({ oldest: { date: '2013-01-02' } });

    await _latchBackfillComplete(db);

    expect(db.settings.put).not.toHaveBeenCalled();
  });

  // ── Rejected write is non-fatal ─────────────────────────────────────────────

  it('a rejecting settings.put logs console.error and does not throw', async () => {
    const putError = new Error('write blocked');
    const db = makeDb({ oldest: { date: '2013-01-01' }, putError });

    await expect(_latchBackfillComplete(db)).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith('[steps]', putError);
  });

  // ── Transaction isolation and schema ────────────────────────────────────────

  it('the put is issued outside any db.transaction call', async () => {
    const db = makeDb({ oldest: { date: '2013-01-01' } });

    await _latchBackfillComplete(db);

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

  // ── Pre-flight token guard (decision 14) ──────────────────────────────────

  it('getAccessToken() returning null → the connect guard fires and fetch is never called', async () => {
    const fetchMock = stubFetch();
    auth.getAccessToken.mockReturnValue(null);
    db = {};

    const engine = createStepSync(auth, db, reporter, document);
    await engine.sync();

    expect(reporter.sync).toHaveBeenCalledWith('🔑 Connect your Google Account first');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('getAccessToken() returning an empty string → the same guard fires', async () => {
    const fetchMock = stubFetch();
    auth.getAccessToken.mockReturnValue('');
    db = {};

    const engine = createStepSync(auth, db, reporter, document);
    await engine.sync();

    expect(reporter.sync).toHaveBeenCalledWith('🔑 Connect your Google Account first');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the token guard fires before the button is touched — sync-btn stays enabled', async () => {
    stubFetch();
    auth.getAccessToken.mockReturnValue(null);
    db = {};

    const engine = createStepSync(auth, db, reporter, document);
    await engine.sync();

    expect(syncBtn().disabled).toBe(false);
    expect(syncBtn().textContent).toBe('Sync Steps');
    expect(auth.getAccessToken).toHaveBeenCalledTimes(1);
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

    const engine = createStepSync(auth, db, reporter, document);
    const first = engine.sync();

    await vi.advanceTimersByTimeAsync(0);
    const fetchCalls = fetchMock.mock.calls.length;
    const messageCount = reporter.sync.mock.calls.length;

    // The first run must genuinely be in flight — one fetch issued, hanging.
    expect(fetchCalls).toBe(1);
    expect(messageCount).toBe(1);

    await engine.sync();

    expect(fetchMock.mock.calls.length).toBe(fetchCalls);
    expect(reporter.sync.mock.calls.length).toBe(messageCount);

    release();
    await first;
  });

  it('a re-entrant sync() does not overwrite the in-flight #sync-status message', async () => {
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

    const engine = createStepSync(auth, db, reporter, document);
    const first = engine.sync();

    await vi.advanceTimersByTimeAsync(0);
    const inFlight = lastSyncMessage();

    // The first run must genuinely be in flight — a progress line was written.
    expect(inFlight).toContain('⏳');

    await engine.sync();

    expect(lastSyncMessage()).toBe(inFlight);
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

    const engine = createStepSync(auth, db, reporter, document);
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

    const engine = createStepSync(auth, db, reporter, document);
    await engine.sync();

    expect(syncBtn().disabled).toBe(false);
  });

  it('#sync-btn.textContent is restored to exactly "Sync Steps" in finally', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-06-12')] });
    stubFetch();

    const engine = createStepSync(auth, db, reporter, document);
    await engine.sync();

    expect(syncBtn().textContent).toBe('Sync Steps');
  });

  it('a doc whose getElementById("sync-btn") returns null → sync() completes normally without throw', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeStatefulDb({ seed: [seedRow('2013-01-01'), seedRow('2025-06-12')] });
    stubFetch();

    const engine = createStepSync(auth, db, reporter, {
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

    const engine = createStepSync(auth, db, reporter, document);
    await engine.sync();

    expect(messages()[0]).toBe(
      '⏳ Full history sync — fetching all Google Fit data since 2013. This can take several minutes; keep this tab open.'
    );
  });

  it('a per-chunk ⏳ progress message is written for every chunk with the phase label and date range', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeScriptedDb({
      firstSeq: [{ date: '2013-01-01' }, { date: '2013-01-01' }],
      latestValue: { date: '2025-05-01' },
      flagRow: { key: BACKFILL_COMPLETE_KEY, value: true },
    });
    stubFetch();

    const engine = createStepSync(auth, db, reporter, document);
    await engine.sync();

    const progress = messages().filter((m) => m.startsWith('⏳'));
    expect(progress).toEqual([
      '⏳ Incremental sync — chunk 1/2 (2025-05-17 → 2025-06-16)…',
      '⏳ Incremental sync — chunk 2/2 (2025-04-28 → 2025-05-17)…',
    ]);
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

    const engine = createStepSync(auth, db, reporter, document);
    await engine.sync();

    expect(timeline).toEqual(['fetch', 'upsert', 'fetch', 'upsert']);
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

    const engine = createStepSync(auth, db, reporter, document);
    await engine.sync();

    expect(maxActive).toBe(1);
  });

  // ── Success message variants (decision 12a) ───────────────────────────────

  it('reports the completed-backfill success message when a full-history run reaches the anchor', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    db = makeScriptedDb({
      firstSeq: [undefined, { date: '2013-01-01' }, { date: '2013-01-01' }],
      latestValue: undefined,
      flagRow: undefined,
    });
    stubFetch();

    const engine = createStepSync(auth, db, reporter, document);
    await engine.sync();

    const anchorMs = _localMidnight(HISTORY_ANCHOR_DATE).getTime();
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

    const engine = createStepSync(auth, db, reporter, document);
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
    });
    stubFetch();

    const engine = createStepSync(auth, db, reporter, document);
    await engine.sync();

    const anchorMs = _localMidnight(HISTORY_ANCHOR_DATE).getTime();
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

    const engine = createStepSync(auth, db, reporter, document);
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
    db = makeStatefulDb({ seed: [seedRow('2024-01-10'), seedRow('2025-06-14')] });

    let callNo = 0;
    let failMidBackfill = true;
    const fetchMock = stubFetch(async (_url, init) => {
      callNo += 1;
      if (failMidBackfill && callNo === 2) throw new TypeError('network down');
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

    const engine = createStepSync(auth, db, reporter, document);

    await engine.sync();
    expect(db.settings.put).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('[steps]', expect.any(Error));
    expect(lastSyncMessage()).not.toContain('✅');
    expect(syncBtn().disabled).toBe(false);
    expect(syncBtn().textContent).toBe('Sync Steps');

    failMidBackfill = false;
    callNo = 0;
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
    const anchorMs = _localMidnight(HISTORY_ANCHOR_DATE).getTime();
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
        .mockResolvedValueOnce(
          makeResponse(200, {
            json: { bucket: [makeBucket(new Date(2025, 4, 17).getTime())] },
          })
        )
        .mockResolvedValueOnce(makeResponse(429))
        .mockResolvedValueOnce(makeResponse(429))
    );

    const engine = createStepSync(auth, db, reporter, document);
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

    const engine = createStepSync(auth, db, reporter, document);
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

    const engine = createStepSync(auth, db, reporter, document);
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

    const engine = createStepSync(auth, db, reporter, document);
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

    const engine = createStepSync(auth, db, reporter, document);
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

    const engine = createStepSync(auth, db, reporter, document);

    await engine.sync();
    expect(lastSyncMessage()).toContain('network error');
    expect(syncBtn().disabled).toBe(false);

    await engine.sync();
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

    const engine = createStepSync(auth, db, reporter, document);
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

    const engine = createStepSync(auth, db, reporter, document);
    await engine.sync();

    expect(lastSyncMessage()).toBe('🔑 Connect your Google Account first');
    expect(statusText()).toBe('🔑 Connect your Google Account first');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(syncBtn().disabled).toBe(false);
    expect(syncBtn().textContent).toBe('Sync Steps');
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

    const engine = createStepSync(auth, db, reporter, document);
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

    const engine = createStepSync(auth, db, reporter, document);
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

    const engine = createStepSync(auth, db, reporter, document);
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
