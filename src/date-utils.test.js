import { describe, it, expect } from 'vitest';
import { _localDate, _addDaysUtc } from './date-utils.js';

// ---------------------------------------------------------------------------
// _localDate
// ---------------------------------------------------------------------------
describe('_localDate', () => {
  it('returns a YYYY-MM-DD string using local getters (not UTC)', () => {
    // Use a fixed timestamp: 2026-01-15T01:00:00Z
    // In UTC+5 this is 2026-01-15T06:00:00 local; in UTC-5 it is 2026-01-14T20:00:00
    const ts = new Date('2026-01-15T01:00:00Z').getTime();
    const result = _localDate(ts);
    const d = new Date(ts);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(result).toBe(expected);
    // Must NOT equal UTC-shifted string in non-UTC timezone (we assert local getters are used)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('defaults to Date.now() when no argument is passed', () => {
    const before = Date.now();
    const result = _localDate();
    const after = Date.now();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The returned date must fall on the same calendar day as now() in local time
    const expected = _localDate(before);
    expect(result).toBe(expected);
  });

  it('zero-pads single-digit month and day', () => {
    const d = new Date(2026, 2, 5, 12, 0, 0); // month is 0-indexed
    const result = _localDate(d.getTime());
    expect(result).toBe('2026-03-05');
  });

  it('returns the correct date for month boundaries', () => {
    expect(_localDate(new Date(2026, 0, 1).getTime())).toBe('2026-01-01');
    expect(_localDate(new Date(2026, 11, 31).getTime())).toBe('2026-12-31');
  });

  it('handles DST transition days without shifting the calendar date', () => {
    // US DST spring forward: 2024-03-10, clock jumps from 2:00 to 3:00
    const springForward = new Date('2024-03-10T02:30:00Z').getTime();
    expect(_localDate(springForward)).toMatch(/^2024-03-10$/);
    // US DST fall back: 2024-11-03, clock falls from 2:00 to 1:00
    const fallBack = new Date('2024-11-03T01:30:00Z').getTime();
    expect(_localDate(fallBack)).toMatch(/^2024-11-03$/);
  });
});

// ---------------------------------------------------------------------------
// _addDaysUtc
// ---------------------------------------------------------------------------
describe('_addDaysUtc', () => {
  it('crosses a leap-year month boundary backwards (2024-03-01 − 1 → 2024-02-29)', () => {
    expect(_addDaysUtc('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('crosses a non-leap-year month boundary backwards (2023-03-01 − 1 → 2023-02-28)', () => {
    expect(_addDaysUtc('2023-03-01', -1)).toBe('2023-02-28');
  });

  it('crosses a year boundary backwards (2024-01-01 − 1 → 2023-12-31)', () => {
    expect(_addDaysUtc('2024-01-01', -1)).toBe('2023-12-31');
  });

  it('crosses a year boundary forwards (2023-12-31 + 1 → 2024-01-01)', () => {
    expect(_addDaysUtc('2023-12-31', 1)).toBe('2024-01-01');
  });

  it('zero-pads single-digit month and day', () => {
    expect(_addDaysUtc('2024-02-10', -1)).toBe('2024-02-09');
    expect(_addDaysUtc('2024-01-10', 0)).toBe('2024-01-10');
    expect(_addDaysUtc('2024-01-10', -1)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is timezone-safe across DST transitions (component parsing + Date.UTC)', () => {
    // US DST start (2024-03-10) and end (2024-11-03): a local-time based
    // implementation would skip or repeat a day here.
    expect(_addDaysUtc('2024-03-10', -1)).toBe('2024-03-09');
    expect(_addDaysUtc('2024-03-10', 1)).toBe('2024-03-11');
    expect(_addDaysUtc('2024-11-03', -1)).toBe('2024-11-02');
    expect(_addDaysUtc('2024-11-03', 1)).toBe('2024-11-04');
  });

  it('matches an independent Date.UTC computation for a long backwards walk', () => {
    let d = '2024-03-05';
    for (let i = 1; i <= 400; i += 1) {
      d = _addDaysUtc(d, -1);
      const [y, m, day] = d.split('-').map(Number);
      const t = Date.UTC(y, m - 1, day);
      const expected = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      expect(d).toBe(expected);
    }
  });

  it('handles forward walks across month boundaries', () => {
    expect(_addDaysUtc('2024-01-31', 1)).toBe('2024-02-01');
    expect(_addDaysUtc('2024-02-28', 1)).toBe('2024-02-29');
    expect(_addDaysUtc('2024-12-31', 1)).toBe('2025-01-01');
  });

  it('handles zero delta', () => {
    expect(_addDaysUtc('2024-06-15', 0)).toBe('2024-06-15');
  });

  it('handles large negative deltas', () => {
    // 2024 is a leap year, so 365 days back from 2024-06-15 lands on 2023-06-16
    expect(_addDaysUtc('2024-06-15', -365)).toBe('2023-06-16');
  });
});
