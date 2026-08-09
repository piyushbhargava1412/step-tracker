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
  _localMidnight,
  _addDays,
  _formatLocalDate,
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
