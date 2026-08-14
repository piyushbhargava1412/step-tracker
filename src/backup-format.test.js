import { describe, it, expect } from 'vitest';
import { formatLastExportLine, formatLastSyncLine, formatBytes } from './backup-format.js';

describe('formatBytes', () => {
  it('formats sub-1KB byte counts as "<1 KB"', () => {
    expect(formatBytes(512)).toBe('<1 KB');
  });

  it('formats zero bytes as "<1 KB"', () => {
    expect(formatBytes(0)).toBe('<1 KB');
  });

  it('rounds to the nearest whole KB', () => {
    expect(formatBytes(245_760)).toBe('240 KB');
  });

  it('rounds up when the fractional KB is >= 0.5', () => {
    expect(formatBytes(1_536)).toBe('2 KB');
  });
});

// All fixture dates below are constructed via the local Date constructor (not
// ISO 'Z' strings) so the same-day/prior-day comparisons are independent of
// the CI/dev machine's timezone.

describe('formatLastExportLine', () => {
  const now = new Date(2026, 7, 14, 20, 0, 0); // local Aug 14 2026, 8pm

  it('returns "Never" when iso is null', () => {
    expect(formatLastExportLine(null, now)).toBe('🕒 Last local export: Never');
  });

  it('returns "Never" when iso is undefined', () => {
    expect(formatLastExportLine(undefined, now)).toBe('🕒 Last local export: Never');
  });

  it('formats a past ISO timestamp as a short month/day/year date', () => {
    const at = new Date(2026, 7, 14, 10, 0, 0).toISOString();
    expect(formatLastExportLine(at, now)).toBe('🕒 Last local export: Aug 14, 2026');
  });

  it('returns "Never" for an unparseable timestamp', () => {
    expect(formatLastExportLine('not-a-date', now)).toBe('🕒 Last local export: Never');
  });
});

describe('formatLastSyncLine', () => {
  const now = new Date(2026, 7, 14, 20, 0, 0); // local Aug 14 2026, 8pm

  it('returns "No cloud backup found" when entry is null', () => {
    expect(formatLastSyncLine(null, now)).toBe('🕒 No cloud backup found');
  });

  it('returns "No cloud backup found" when entry is undefined', () => {
    expect(formatLastSyncLine(undefined, now)).toBe('🕒 No cloud backup found');
  });

  it('formats a same-day sync as "Today, <time> (<size>)"', () => {
    const at = new Date(2026, 7, 14, 18, 30, 0).toISOString();
    const line = formatLastSyncLine({ at, bytes: 245_760 }, now);
    expect(line).toMatch(/^🕒 Last cloud sync: Today, .+\(240 KB\)$/);
  });

  it('formats a prior-day sync with the short date instead of "Today"', () => {
    const at = new Date(2026, 7, 12, 18, 30, 0).toISOString();
    const line = formatLastSyncLine({ at, bytes: 1024 }, now);
    expect(line).toMatch(/^🕒 Last cloud sync: Aug 12, 2026, .+\(1 KB\)$/);
  });

  it('returns "No cloud backup found" for an unparseable timestamp', () => {
    expect(formatLastSyncLine({ at: 'not-a-date', bytes: 100 }, now)).toBe('🕒 No cloud backup found');
  });
});
