import { describe, it, expect } from 'vitest';
import { isNearMiss, dayOfWeekIndex, dateBounds } from './search-lab.js';

describe('isNearMiss', () => {
  it('returns true when effectiveDistanceKm is exactly target * 0.90 (lower boundary inclusive)', () => {
    expect(isNearMiss(9, 10)).toBe(true);
  });

  it('returns true when effectiveDistanceKm is between 0.90*target and target', () => {
    expect(isNearMiss(9.5, 10)).toBe(true);
  });

  it('returns false when effectiveDistanceKm equals target (upper boundary exclusive)', () => {
    expect(isNearMiss(10, 10)).toBe(false);
  });

  it('returns false when effectiveDistanceKm is above target', () => {
    expect(isNearMiss(11, 10)).toBe(false);
  });

  it('returns false when effectiveDistanceKm is below 0.90*target', () => {
    expect(isNearMiss(8.9, 10)).toBe(false);
  });

  it('returns false when effectiveDistanceKm is non-finite (Infinity)', () => {
    expect(isNearMiss(Infinity, 10)).toBe(false);
  });

  it('returns false when effectiveDistanceKm is NaN', () => {
    expect(isNearMiss(NaN, 10)).toBe(false);
  });

  it('returns false when target is non-finite', () => {
    expect(isNearMiss(9, Infinity)).toBe(false);
  });

  it('returns false when target is zero', () => {
    expect(isNearMiss(0, 0)).toBe(false);
  });

  it('returns false when target is negative', () => {
    expect(isNearMiss(-1, -2)).toBe(false);
  });
});

describe('dayOfWeekIndex', () => {
  it('returns 0 for a known Monday (2026-08-10)', () => {
    expect(dayOfWeekIndex('2026-08-10')).toBe(0);
  });

  it('returns 6 for a known Sunday (2026-08-09)', () => {
    expect(dayOfWeekIndex('2026-08-09')).toBe(6);
  });

  it('returns 1 for a known Tuesday (2026-08-11)', () => {
    expect(dayOfWeekIndex('2026-08-11')).toBe(1);
  });

  it('returns 4 for a known Friday (2026-01-02)', () => {
    expect(dayOfWeekIndex('2026-01-02')).toBe(4);
  });
});

describe('dateBounds', () => {
  it('returns correct start and endExclusive for same-month range', () => {
    expect(dateBounds('2026-01-01', '2026-01-31')).toEqual({
      start: '2026-01-01',
      endExclusive: '2026-02-01',
    });
  });

  it('handles month rollover (Jan 31 → Feb 1)', () => {
    expect(dateBounds('2026-01-31', '2026-01-31')).toEqual({
      start: '2026-01-31',
      endExclusive: '2026-02-01',
    });
  });

  it('handles month and year rollover (Feb 28 → Mar 1)', () => {
    expect(dateBounds('2026-01-31', '2026-02-28')).toEqual({
      start: '2026-01-31',
      endExclusive: '2026-03-01',
    });
  });

  it('handles December → January year rollover', () => {
    expect(dateBounds('2025-12-01', '2025-12-31')).toEqual({
      start: '2025-12-01',
      endExclusive: '2026-01-01',
    });
  });
});
