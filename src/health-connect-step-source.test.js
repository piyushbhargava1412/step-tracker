import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createHealthConnectStepSource,
  HEALTH_CONNECT_LABEL,
  READ_TYPES,
} from './health-connect-step-source.js';
import {
  assertStepSource,
  SYNC_ERROR_NAME,
  FAILURE_AUTH_EXPIRED,
  FAILURE_SOURCE_ERROR,
} from './step-source.js';

/** ISO instant of a local wall-clock time (the plugin returns ISO strings). */
const at = (y, m0, d, h = 0) => new Date(y, m0, d, h).toISOString();

/** One hourly aggregate bucket as @capgo/capacitor-health returns it. */
function bucket(y, m0, d, h, value, unit = 'count') {
  return { startDate: at(y, m0, d, h), endDate: at(y, m0, d, h + 1), value, values: { sum: value }, unit };
}

/** Local-midnight chunk covering June 14 and 15, 2025. */
const CHUNK = { startMs: new Date(2025, 5, 14).getTime(), endMs: new Date(2025, 5, 16).getTime() };
const CTX = { index: 2, total: 5, phase: 'Incremental sync' };

function pluginError(message, code) {
  const error = new Error(message);
  if (code) error.code = code;
  return error;
}

describe('ST-019: createHealthConnectStepSource', () => {
  let health;
  let reporter;

  beforeEach(() => {
    health = {
      isAvailable: vi.fn().mockResolvedValue({ available: true, platform: 'android' }),
      checkAuthorization: vi.fn().mockResolvedValue({
        readAuthorized: ['steps', 'distance'],
        readDenied: [],
        writeAuthorized: [],
        writeDenied: [],
      }),
      queryAggregated: vi.fn(async ({ dataType }) => ({
        samples:
          dataType === 'steps'
            ? [bucket(2025, 5, 14, 7, 3000), bucket(2025, 5, 14, 18, 5000.4)]
            : [bucket(2025, 5, 14, 7, 2100, 'meter'), bucket(2025, 5, 14, 18, 4000, 'meter')],
      })),
    };
    reporter = { sync: vi.fn(), status: vi.fn() };
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Contract ──────────────────────────────────────────────────────────────

  it('satisfies the StepSource contract with Health Connect wording', () => {
    const source = createHealthConnectStepSource(health, reporter);
    expect(() => assertStepSource(source)).not.toThrow();
    expect(source.label).toBe(HEALTH_CONNECT_LABEL);
    expect(HEALTH_CONNECT_LABEL).toBe('Health Connect');
    expect(source.notReadyMessage).toBe('🔑 Tap "Connect Health Connect" to allow step access first');
    expect(source.accessLostMessage).toBe('Health Connect access was removed — tap "Connect Health Connect" to allow it again');
  });

  it('reads steps and distance only', () => {
    expect(READ_TYPES).toEqual(['steps', 'distance']);
  });

  it('fails fast without a plugin or reporter', () => {
    expect(() => createHealthConnectStepSource(null, reporter)).toThrow(TypeError);
    expect(() => createHealthConnectStepSource({}, reporter)).toThrow(TypeError);
    expect(() => createHealthConnectStepSource(health, null)).toThrow(TypeError);
  });

  // ── isReady ───────────────────────────────────────────────────────────────

  it('is ready when Health Connect is available and step reading is allowed', async () => {
    await expect(createHealthConnectStepSource(health, reporter).isReady()).resolves.toBe(true);
    expect(health.checkAuthorization).toHaveBeenCalledWith({ read: READ_TYPES });
  });

  it('is not ready when Health Connect is unavailable, without asking for permissions', async () => {
    health.isAvailable.mockResolvedValue({ available: false, reason: 'Health Connect needs an update.' });
    await expect(createHealthConnectStepSource(health, reporter).isReady()).resolves.toBe(false);
    expect(health.checkAuthorization).not.toHaveBeenCalled();
  });

  it('is not ready when step reading is not allowed, even if distance is', async () => {
    health.checkAuthorization.mockResolvedValue({ readAuthorized: ['distance'], readDenied: ['steps'] });
    await expect(createHealthConnectStepSource(health, reporter).isReady()).resolves.toBe(false);
  });

  // ── fetchDays ─────────────────────────────────────────────────────────────

  it('queries hourly sums for steps and distance over the exact chunk instants', async () => {
    await createHealthConnectStepSource(health, reporter).fetchDays(CHUNK, CTX);

    const requests = health.queryAggregated.mock.calls.map(([options]) => options);
    expect(requests).toEqual([
      { dataType: 'steps', startDate: new Date(CHUNK.startMs).toISOString(), endDate: new Date(CHUNK.endMs).toISOString(), bucket: 'hour', aggregation: 'sum' },
      { dataType: 'distance', startDate: new Date(CHUNK.startMs).toISOString(), endDate: new Date(CHUNK.endMs).toISOString(), bucket: 'hour', aggregation: 'sum' },
    ]);
  });

  it('sums hourly buckets into local days and fills the 24-hour step profile', async () => {
    const days = await createHealthConnectStepSource(health, reporter).fetchDays(CHUNK, CTX);

    expect(days[0].date).toBe('2025-06-14');
    expect(days[0].steps).toBe(8000);
    expect(days[0].distanceKm).toBe(6.1);
    expect(days[0].hourlySteps).toHaveLength(24);
    expect(days[0].hourlySteps[7]).toBe(3000);
    expect(days[0].hourlySteps[18]).toBe(5000);
    expect(days[0].hourlySteps.reduce((a, b) => a + b, 0)).toBe(8000);
  });

  it('zero-fills every local day in the chunk that has no data (like Google Fit)', async () => {
    const days = await createHealthConnectStepSource(health, reporter).fetchDays(CHUNK, CTX);

    expect(days.map((d) => d.date)).toEqual(['2025-06-14', '2025-06-15']);
    expect(days[1]).toEqual({ date: '2025-06-15', steps: 0, distanceKm: null, hourlySteps: null });
  });

  it('reports distance as unknown (null) for a day with steps but no distance data', async () => {
    health.queryAggregated.mockImplementation(async ({ dataType }) => ({
      samples: dataType === 'steps' ? [bucket(2025, 5, 14, 9, 1200)] : [],
    }));

    const [day] = await createHealthConnectStepSource(health, reporter).fetchDays(CHUNK, CTX);

    expect(day).toMatchObject({ date: '2025-06-14', steps: 1200, distanceKm: null });
  });

  it('a failed distance query is non-fatal: distance is unknown and the error is logged', async () => {
    const failure = pluginError('Permission denied', 'permission-denied');
    health.queryAggregated.mockImplementation(async ({ dataType }) => {
      if (dataType === 'distance') throw failure;
      return { samples: [bucket(2025, 5, 14, 9, 1200)] };
    });

    const [day] = await createHealthConnectStepSource(health, reporter).fetchDays(CHUNK, CTX);

    expect(day).toMatchObject({ steps: 1200, distanceKm: null });
    expect(console.error).toHaveBeenCalledWith('[health-connect] distance read failed', failure);
  });

  it('a revoked step permission becomes an auth-expired failure with the chunk coordinates', async () => {
    const failure = pluginError('Permission denied', 'permission-denied');
    health.queryAggregated.mockRejectedValue(failure);

    const error = await createHealthConnectStepSource(health, reporter).fetchDays(CHUNK, CTX).catch((e) => e);

    expect(error).toMatchObject({ name: SYNC_ERROR_NAME, kind: FAILURE_AUTH_EXPIRED, index: 2, total: 5, phase: 'Incremental sync', status: null });
    expect(error.cause).toBe(failure);
  });

  it('any other step read failure becomes a source-error failure', async () => {
    const failure = pluginError('Rate limited', 'query-aggregated-failed');
    health.queryAggregated.mockRejectedValue(failure);

    const error = await createHealthConnectStepSource(health, reporter).fetchDays(CHUNK, CTX).catch((e) => e);

    expect(error).toMatchObject({ name: SYNC_ERROR_NAME, kind: FAILURE_SOURCE_ERROR });
    expect(error.cause).toBe(failure);
  });

  it('ignores buckets with an unparseable start date', async () => {
    health.queryAggregated.mockImplementation(async ({ dataType }) => ({
      samples: dataType === 'steps' ? [{ startDate: 'garbage', value: 99 }, bucket(2025, 5, 14, 9, 10)] : [],
    }));

    const [day] = await createHealthConnectStepSource(health, reporter).fetchDays(CHUNK, CTX);

    expect(day.steps).toBe(10);
  });

  it('treats a response without samples as no data', async () => {
    health.queryAggregated.mockResolvedValue({});
    const days = await createHealthConnectStepSource(health, reporter).fetchDays(CHUNK, CTX);
    expect(days.every((d) => d.steps === 0)).toBe(true);
  });

  it('emits a progress status before reading', async () => {
    await createHealthConnectStepSource(health, reporter).fetchDays(CHUNK, CTX);
    expect(reporter.status).toHaveBeenCalledWith('⏳ Reading steps from Health Connect…');
  });

  it('fails fast on a malformed chunk without calling the plugin', async () => {
    const source = createHealthConnectStepSource(health, reporter);
    await expect(source.fetchDays({ startMs: 0, endMs: Number.NaN }, CTX)).rejects.toThrow(TypeError);
    await expect(source.fetchDays(undefined, CTX)).rejects.toThrow(TypeError);
    expect(health.queryAggregated).not.toHaveBeenCalled();
  });

  it('keeps local days correct across a DST change (days are calendar days, not 24h blocks)', async () => {
    // Whatever the machine timezone, each bucket is attributed by its local
    // calendar date, so a 23- or 25-hour day still maps to one date.
    const start = new Date(2025, 2, 29).getTime();
    const end = new Date(2025, 3, 1).getTime();
    health.queryAggregated.mockImplementation(async ({ dataType }) => ({
      samples: dataType === 'steps' ? [bucket(2025, 2, 30, 23, 500), bucket(2025, 2, 31, 0, 700)] : [],
    }));

    const days = await createHealthConnectStepSource(health, reporter).fetchDays({ startMs: start, endMs: end }, CTX);

    expect(days.map((d) => [d.date, d.steps])).toEqual([
      ['2025-03-29', 0],
      ['2025-03-30', 500],
      ['2025-03-31', 700],
    ]);
  });
});
