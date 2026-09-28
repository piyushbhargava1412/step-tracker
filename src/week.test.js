import { describe, it, expect, vi } from 'vitest';
import { mondayOf, buildWeekDays, computeWeekNavBounds, formatWeekRange, createWeek } from './week.js';
import { CLASSIFICATION_MISSED, CLASSIFICATION_MET, CLASSIFICATION_NO_DATA } from './calendar.js';

describe('mondayOf', () => {
  it('returns the Monday of the week (weeks start on Monday, like the month grid)', () => {
    expect(mondayOf('2026-09-28')).toBe('2026-09-28'); // Monday
    expect(mondayOf('2026-09-27')).toBe('2026-09-21'); // Sunday
    expect(mondayOf('2026-09-23')).toBe('2026-09-21'); // Wednesday
  });

  it('crosses month and year boundaries', () => {
    expect(mondayOf('2026-01-01')).toBe('2025-12-29');
  });
});

describe('buildWeekDays', () => {
  it('lists the seven days from Monday, flagging today and the future', () => {
    const days = buildWeekDays('2026-09-28', '2026-09-30');
    expect(days.map((d) => d.date)).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ]);
    expect(days.map((d) => d.dayLabel)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(days[2]).toMatchObject({ isToday: true, isFuture: false });
    expect(days[3]).toMatchObject({ isToday: false, isFuture: true });
    expect(days[0].fullLabel).toBe('Mon 28 Sep');
    expect(days[4].fullLabel).toBe('Fri 2 Oct');
  });
});

describe('computeWeekNavBounds', () => {
  it('allows going back while older records exist, and forward up to the current week', () => {
    expect(computeWeekNavBounds('2026-01-05', '2026-09-30', '2026-09-21')).toEqual({ canGoPrev: true, canGoNext: true });
    expect(computeWeekNavBounds('2026-01-05', '2026-09-30', '2026-09-28')).toEqual({ canGoPrev: true, canGoNext: false });
  });

  it('stops at the week holding the first record', () => {
    expect(computeWeekNavBounds('2026-09-23', '2026-09-30', '2026-09-21')).toEqual({ canGoPrev: false, canGoNext: true });
    expect(computeWeekNavBounds(null, '2026-09-30', '2026-09-28')).toEqual({ canGoPrev: false, canGoNext: false });
  });
});

describe('formatWeekRange', () => {
  it('formats within a month, across months and across years', () => {
    expect(formatWeekRange('2026-09-21')).toBe('21 – 27 Sep 2026');
    expect(formatWeekRange('2026-09-28')).toBe('28 Sep – 4 Oct 2026');
    expect(formatWeekRange('2025-12-29')).toBe('29 Dec 2025 – 4 Jan 2026');
  });
});

describe('createWeek().loadWeek', () => {
  function makeDb(records, earliest = records[0]) {
    return {
      daily_records: {
        where: vi.fn(() => ({ between: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(records) })) })),
        orderBy: vi.fn(() => ({ first: vi.fn().mockResolvedValue(earliest) })),
      },
    };
  }
  const goal = { getActiveStepGoal: vi.fn().mockResolvedValue(10000) };

  it('classifies each day and totals the week', async () => {
    const records = [
      { date: '2026-09-21', effective_steps: 11902 },
      { date: '2026-09-22', effective_steps: 14411 },
      { date: '2026-09-26', effective_steps: 9982 },
    ];
    const db = makeDb(records);
    const week = await createWeek(db, goal, { today: () => '2026-09-30' }).loadWeek('2026-09-21');

    expect(db.daily_records.where).toHaveBeenCalledWith('date');
    expect(week.start).toBe('2026-09-21');
    expect(week.label).toBe('21 – 27 Sep 2026');
    expect(week.activeStepGoal).toBe(10000);
    expect(week.days).toHaveLength(7);
    expect(week.days[0].classification.state).toBe(CLASSIFICATION_MET);
    expect(week.days[5].classification.state).toBe(CLASSIFICATION_MISSED);
    expect(week.days[3].classification.state).toBe(CLASSIFICATION_NO_DATA);
    expect(week.days[0].record.effective_steps).toBe(11902);
    expect(week.aggregates).toMatchObject({ totalSteps: 36295, daysEvaluated: 3, targetMetDays: 2, averageDailySteps: 12098 });
    expect(week.navBounds).toEqual({ canGoPrev: false, canGoNext: true });
  });

  it('defaults to the current week', async () => {
    const week = await createWeek(makeDb([]), goal, { today: () => '2026-09-30' }).loadWeek();
    expect(week.start).toBe('2026-09-28');
  });

  it('buildZeroState gives an empty, navigable-nowhere week', () => {
    const week = createWeek(makeDb([]), goal, { today: () => '2026-09-30' }).buildZeroState('2026-09-21');
    expect(week.days).toHaveLength(7);
    expect(week.days.every((d) => d.record === null)).toBe(true);
    expect(week.aggregates.totalSteps).toBeNull();
    expect(week.navBounds).toEqual({ canGoPrev: false, canGoNext: false });
  });
});

describe('today in the week', () => {
  function makeDb(records) {
    return {
      daily_records: {
        where: vi.fn(() => ({ between: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(records) })) })),
        orderBy: vi.fn(() => ({ first: vi.fn().mockResolvedValue(records[0]) })),
      },
    };
  }
  const goal = { getActiveStepGoal: vi.fn().mockResolvedValue(10000) };

  it('goal hits count finished days only — today is still in progress', async () => {
    const records = [
      { date: '2026-09-28', effective_steps: 12000 },
      { date: '2026-09-29', effective_steps: 3000 },
    ];
    const week = await createWeek(makeDb(records), goal, { today: () => '2026-09-29' }).loadWeek('2026-09-28');
    expect(week.hits).toEqual({ met: 1, finished: 1 });
    expect(week.days[1].inProgress).toBe(true);
    expect(week.days[0].inProgress).toBe(false);
  });

  it('a week that only has today so far has no finished days', async () => {
    const records = [{ date: '2026-09-28', effective_steps: 7412 }];
    const week = await createWeek(makeDb(records), goal, { today: () => '2026-09-28' }).loadWeek('2026-09-28');
    expect(week.hits).toEqual({ met: 0, finished: 0 });
  });
});
