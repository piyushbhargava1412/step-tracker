import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  createFitStepSource,
  FIT_SOURCE_LABEL,
  STEP_API_URL,
  DAILY_BUCKET_MS,
  HOURLY_BUCKET_MS,
  METRES_PER_KM,
  RETRY_BACKOFF_MS,
  MAX_RETRY_AFTER_MS,
  MAX_ATTEMPTS_PER_CHUNK,
  _normalizeBuckets,
  _normalizeHourlyBuckets,
  _fetchChunk,
  _resolveBackoffMs,
} from './fit-step-source.js';
import {
  SYNC_ERROR_NAME,
  FAILURE_AUTH_EXPIRED,
  FAILURE_RETRY_EXHAUSTED,
  FAILURE_HTTP_ERROR,
  FAILURE_NETWORK_ERROR,
  assertStepSource,
} from './step-source.js';
import { _localMidnight, PHASE_FULL_HISTORY, PHASE_INCREMENTAL } from './steps.js';

/** Realistic Fit dataSourceIds — the parser locates datasets by substring. */
const STEP_DS = 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps';
const DIST_DS = 'derived:com.google.distance.delta:com.google.android.gms:merge_distance_delta';

// ── Constants ─────────────────────────────────────────────────────────────────

describe('ST-016: fit-step-source.js constants', () => {
  it('STEP_API_URL equals the full Google Fit aggregate endpoint', () => {
    expect(STEP_API_URL).toBe(
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate'
    );
  });

  it('bucket sizes are one day and one hour', () => {
    expect(DAILY_BUCKET_MS).toBe(86_400_000);
    expect(HOURLY_BUCKET_MS).toBe(3_600_000);
  });

  it('METRES_PER_KM converts Fit fpVal metres to kilometres', () => {
    expect(METRES_PER_KM).toBe(1000);
  });
});

// ── createFitStepSource — StepSource contract ─────────────────────────────────

describe('ST-016: createFitStepSource — StepSource contract', () => {
  /** Local midnight bounds for a 2-day chunk: June 14 → June 16, 2025. */
  const CHUNK = {
    startMs: new Date(2025, 5, 14).getTime(),
    endMs: new Date(2025, 5, 16).getTime(),
  };
  const CTX = { index: 1, total: 1, phase: PHASE_INCREMENTAL };

  let auth, reporter;

  /** Build a Fit daily bucket for local date (y, m0, d). */
  function dailyBucket(y, m0, d, steps, metres) {
    const dataset = [{ dataSourceId: STEP_DS, point: [{ value: [{ intVal: steps }] }] }];
    if (metres !== undefined) {
      dataset.push({ dataSourceId: DIST_DS, point: [{ value: [{ fpVal: metres }] }] });
    }
    return { startTimeMillis: String(new Date(y, m0, d).getTime()), dataset };
  }

  /** Build a Fit hourly bucket for local date/hour. */
  function hourlyBucket(y, m0, d, h, steps) {
    return {
      startTimeMillis: String(new Date(y, m0, d, h).getTime()),
      dataset: [{ dataSourceId: STEP_DS, point: [{ value: [{ intVal: steps }] }] }],
    };
  }

  function ok(json) {
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => json };
  }

  /** fetchFn double that answers the daily and hourly requests separately. */
  function routedFetch({ daily, hourly }) {
    return vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      const isHourly = body.bucketByTime.durationMillis === HOURLY_BUCKET_MS;
      return isHourly ? hourly() : daily();
    });
  }

  beforeEach(() => {
    auth = { getAccessToken: vi.fn().mockReturnValue('tok-abc') };
    reporter = { sync: vi.fn(), status: vi.fn() };
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('satisfies the StepSource contract', () => {
    const source = createFitStepSource(auth, reporter, vi.fn());
    expect(() => assertStepSource(source)).not.toThrow();
  });

  it('carries the exact user-facing strings the Fit sync has always shown', () => {
    const source = createFitStepSource(auth, reporter, vi.fn());
    expect(source.label).toBe(FIT_SOURCE_LABEL);
    expect(FIT_SOURCE_LABEL).toBe('Google Fit');
    expect(source.notReadyMessage).toBe('🔑 Connect your Google Account first');
    expect(source.accessLostMessage).toBe('Session expired — reconnect your Google Account');
  });

  it('isReady() reflects whether an access token is present, re-read on every call', () => {
    const source = createFitStepSource(auth, reporter, vi.fn());
    expect(source.isReady()).toBe(true);
    auth.getAccessToken.mockReturnValue(null);
    expect(source.isReady()).toBe(false);
    auth.getAccessToken.mockReturnValue('');
    expect(source.isReady()).toBe(false);
  });

  it('fails fast when auth or reporter is missing', () => {
    expect(() => createFitStepSource(null, reporter)).toThrow(TypeError);
    expect(() => createFitStepSource({}, reporter)).toThrow(TypeError);
    expect(() => createFitStepSource(auth, null)).toThrow(TypeError);
  });

  it('fetchDays returns one DayReading per daily bucket with hourly steps attached by local date', async () => {
    const fetchFn = routedFetch({
      daily: () => ok({ bucket: [dailyBucket(2025, 5, 14, 8000, 6100), dailyBucket(2025, 5, 15, 1200)] }),
      hourly: () => ok({ bucket: [hourlyBucket(2025, 5, 14, 7, 3000), hourlyBucket(2025, 5, 14, 18, 5000)] }),
    });
    const source = createFitStepSource(auth, reporter, fetchFn);

    const days = await source.fetchDays(CHUNK, CTX);

    expect(days).toHaveLength(2);
    expect(days[0]).toEqual({
      date: '2025-06-14',
      steps: 8000,
      distanceKm: 6.1,
      hourlySteps: expect.any(Array),
    });
    expect(days[0].hourlySteps[7]).toBe(3000);
    expect(days[0].hourlySteps[18]).toBe(5000);
    // No distance dataset → the source reports "unknown", never an estimate.
    expect(days[1]).toEqual({ date: '2025-06-15', steps: 1200, distanceKm: null, hourlySteps: null });
  });

  it('issues the daily request before the hourly request, both with the bearer token', async () => {
    const fetchFn = routedFetch({ daily: () => ok({ bucket: [] }), hourly: () => ok({ bucket: [] }) });
    const source = createFitStepSource(auth, reporter, fetchFn);

    await source.fetchDays(CHUNK, CTX);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [dailyInit, hourlyInit] = fetchFn.mock.calls.map((call) => call[1]);
    expect(JSON.parse(dailyInit.body).bucketByTime.durationMillis).toBe(DAILY_BUCKET_MS);
    expect(JSON.parse(hourlyInit.body).bucketByTime.durationMillis).toBe(HOURLY_BUCKET_MS);
    expect(hourlyInit.headers.Authorization).toBe('Bearer tok-abc');
  });

  it('emits the hourly progress status before fetching', async () => {
    const fetchFn = routedFetch({ daily: () => ok({ bucket: [] }), hourly: () => ok({ bucket: [] }) });
    await createFitStepSource(auth, reporter, fetchFn).fetchDays(CHUNK, CTX);
    expect(reporter.status).toHaveBeenCalledWith('⏳ Fetching hourly step data…');
  });

  it('works with a reporter that has no status() method', async () => {
    const fetchFn = routedFetch({ daily: () => ok({ bucket: [] }), hourly: () => ok({ bucket: [] }) });
    const bare = { sync: vi.fn() };
    await expect(createFitStepSource(auth, bare, fetchFn).fetchDays(CHUNK, CTX)).resolves.toEqual([]);
  });

  it('a failed hourly request is non-fatal: every day gets hourlySteps null and the error is logged', async () => {
    const fetchFn = routedFetch({
      daily: () => ok({ bucket: [dailyBucket(2025, 5, 14, 500)] }),
      hourly: () => ({ ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) }),
    });

    const days = await createFitStepSource(auth, reporter, fetchFn).fetchDays(CHUNK, CTX);

    expect(days).toEqual([{ date: '2025-06-14', steps: 500, distanceKm: null, hourlySteps: null }]);
    expect(console.error).toHaveBeenCalledWith('[steps] hourly fetch failed', expect.any(Error));
  });

  it('a thrown hourly request is non-fatal too', async () => {
    const fetchFn = routedFetch({
      daily: () => ok({ bucket: [dailyBucket(2025, 5, 14, 500)] }),
      hourly: () => { throw new TypeError('Failed to fetch'); },
    });

    const days = await createFitStepSource(auth, reporter, fetchFn).fetchDays(CHUNK, CTX);

    expect(days[0].hourlySteps).toBeNull();
  });

  it('a daily response without a bucket array yields no days', async () => {
    const fetchFn = routedFetch({ daily: () => ok({}), hourly: () => ok({}) });
    await expect(createFitStepSource(auth, reporter, fetchFn).fetchDays(CHUNK, CTX)).resolves.toEqual([]);
  });

  it('hourly buckets with an unusable timestamp are ignored', async () => {
    const fetchFn = routedFetch({
      daily: () => ok({ bucket: [dailyBucket(2025, 5, 14, 500)] }),
      hourly: () => ok({ bucket: [{ dataset: [] }, hourlyBucket(2025, 5, 14, 9, 500)] }),
    });

    const [day] = await createFitStepSource(auth, reporter, fetchFn).fetchDays(CHUNK, CTX);

    expect(day.hourlySteps[9]).toBe(500);
  });

  it('a classified daily failure propagates with the chunk coordinates from ctx', async () => {
    const fetchFn = routedFetch({
      daily: () => ({ ok: false, status: 401, headers: { get: () => null }, json: async () => ({}) }),
      hourly: () => ok({ bucket: [] }),
    });

    const error = await createFitStepSource(auth, reporter, fetchFn)
      .fetchDays(CHUNK, { index: 3, total: 9, phase: PHASE_FULL_HISTORY })
      .catch((e) => e);

    expect(error.name).toBe(SYNC_ERROR_NAME);
    expect(error.kind).toBe(FAILURE_AUTH_EXPIRED);
    expect(error.index).toBe(3);
    expect(error.total).toBe(9);
    expect(error.phase).toBe(PHASE_FULL_HISTORY);
  });

  it('defaults fetchFn to the global fetch, resolved at call time', async () => {
    const globalFetch = routedFetch({ daily: () => ok({ bucket: [] }), hourly: () => ok({ bucket: [] }) });
    const source = createFitStepSource(auth, reporter);
    vi.stubGlobal('fetch', globalFetch);

    await source.fetchDays(CHUNK, CTX);

    expect(globalFetch).toHaveBeenCalledTimes(2);
  });
});

// ── _normalizeBuckets — Fit daily buckets → { date, steps, distanceKm } ───────

describe('ST-016: _normalizeBuckets — Fit daily buckets to readings', () => {
  const JUNE_15_MS_STR = String(new Date(2025, 5, 15).getTime());

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Build a minimal bucket with the given step intVals and distance fpVals. */
  function makeBucket({
    startTimeMillis = JUNE_15_MS_STR,
    stepPoints = [],
    distPoints = [],
    includeDistDataset = true,
  } = {}) {
    const dataset = [
      { dataSourceId: STEP_DS, point: stepPoints.map((intVal) => ({ value: [{ intVal }] })) },
    ];
    if (includeDistDataset) {
      dataset.push({ dataSourceId: DIST_DS, point: distPoints.map((fpVal) => ({ value: [{ fpVal }] })) });
    }
    return { startTimeMillis, dataset };
  }

  it('every reading has exactly the { date, steps, distanceKm } shape', () => {
    const [reading] = _normalizeBuckets([makeBucket({ stepPoints: [500], distPoints: [400] })]);
    expect(Object.keys(reading).sort()).toEqual(['date', 'distanceKm', 'steps']);
  });

  it('an empty dataset array still yields a 0-step day (zero-fill, not a skip) with unknown distance', () => {
    const readings = _normalizeBuckets([{ startTimeMillis: JUNE_15_MS_STR, dataset: [] }]);
    expect(readings).toEqual([{ date: '2025-06-15', steps: 0, distanceKm: null }]);
  });

  it('sums step intVals', () => {
    const [reading] = _normalizeBuckets([makeBucket({ stepPoints: [1000, 2000, 500] })]);
    expect(reading.steps).toBe(3500);
  });

  it('truncates fractional step sums', () => {
    const [reading] = _normalizeBuckets([makeBucket({ stepPoints: [10.9] })]);
    expect(reading.steps).toBe(10);
  });

  it('converts distance fpVal metres to km rounded to 3 decimals', () => {
    const metres = 1234.567;
    const [reading] = _normalizeBuckets([makeBucket({ stepPoints: [5000], distPoints: [metres] })]);
    expect(reading.distanceKm).toBe(Number((metres / 1000).toFixed(3)));
  });

  it.each([
    ['a missing distance dataset', { includeDistDataset: false }],
    ['an empty distance dataset', { distPoints: [] }],
    ['a non-finite distance total', { distPoints: [Infinity] }],
  ])('reports distanceKm null for %s — estimation is the engine\'s job', (_label, opts) => {
    const [reading] = _normalizeBuckets([makeBucket({ stepPoints: [8000], ...opts })]);
    expect(reading.distanceKm).toBeNull();
    expect(reading.steps).toBe(8000);
  });

  it('keeps a 0-step day with real distance as-is (cycling / manual log)', () => {
    const [reading] = _normalizeBuckets([makeBucket({ stepPoints: [0], distPoints: [5000] })]);
    expect(reading).toEqual({ date: '2025-06-15', steps: 0, distanceKm: 5 });
  });

  it('locates datasets by dataSourceId substring, not position', () => {
    const bucket = {
      startTimeMillis: JUNE_15_MS_STR,
      dataset: [
        { dataSourceId: 'derived:com.google.distance.delta:...', point: [{ value: [{ fpVal: 3000 }] }] },
        { dataSourceId: 'derived:com.google.step_count.delta:...', point: [{ value: [{ intVal: 9999 }] }] },
      ],
    };
    expect(_normalizeBuckets([bucket])[0]).toEqual({ date: '2025-06-15', steps: 9999, distanceKm: 3 });
  });

  it('falls back to index 0 (steps) / 1 (distance) when dataSourceId is absent', () => {
    const bucket = {
      startTimeMillis: JUNE_15_MS_STR,
      dataset: [
        { point: [{ value: [{ intVal: 4321 }] }] },
        { point: [{ value: [{ fpVal: 3000 }] }] },
      ],
    };
    expect(_normalizeBuckets([bucket])[0]).toEqual({ date: '2025-06-15', steps: 4321, distanceKm: 3 });
  });

  it('derives the date label from local getters, never toISOString()', () => {
    const localMidnightMs = new Date(2025, 5, 15, 0, 0, 0, 0).getTime();
    const [reading] = _normalizeBuckets([{ startTimeMillis: String(localMidnightMs), dataset: [] }]);
    expect(reading.date).toBe('2025-06-15');
  });

  it('falls back to startTimeNanos / 1e6 when startTimeMillis is absent', () => {
    const ms = new Date(2025, 5, 15).getTime();
    const [reading] = _normalizeBuckets([{ startTimeNanos: String(ms * 1_000_000), dataset: [] }]);
    expect(reading.date).toBe('2025-06-15');
  });

  it.each([
    ['missing dataset property', { startTimeMillis: JUNE_15_MS_STR }],
    ['missing point array', { startTimeMillis: JUNE_15_MS_STR, dataset: [{ dataSourceId: STEP_DS }] }],
    ['missing value array', { startTimeMillis: JUNE_15_MS_STR, dataset: [{ dataSourceId: STEP_DS, point: [{}] }] }],
  ])('%s does not throw and yields a 0-step day', (_label, bucket) => {
    expect(_normalizeBuckets([bucket])[0].steps).toBe(0);
  });

  it.each([
    ['neither timestamp', { dataset: [] }],
    ['a non-numeric startTimeMillis', { startTimeMillis: 'not-a-number', dataset: [] }],
  ])('skips a bucket with %s rather than producing a NaN date key', (_label, bucket) => {
    expect(_normalizeBuckets([bucket])).toEqual([]);
  });
});

describe('Fit _fetchChunk — transient-retry policy and 401 short-circuit', () => {
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

  it('bucketByTime.durationMillis equals DAILY_BUCKET_MS', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse(200));

    await _fetchChunk(auth, reporter, CHUNK, 1, 1, PHASE_INCREMENTAL);

    expect(bodyOfCall().bucketByTime.durationMillis).toBe(DAILY_BUCKET_MS);
    expect(DAILY_BUCKET_MS).toBe(86_400_000);
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

describe('Fit _normalizeHourlyBuckets', () => {
  /**
   * Builds each fixture from local y/m/d/h components (never a fixed UTC
   * epoch) so the expected local-hour index holds regardless of the
   * machine/CI timezone running the suite — this mirrors the fix itself
   * (buckets are read back through `.getHours()`, the local-clock lens).
   */

  /** Build a single 1-hour bucket at the given local hour with the given step intVals. */
  function makeHourlyBucket(localHour, intVals = []) {
    const startMs = new Date(2025, 0, 1, localHour).getTime();
    return {
      startTimeMillis: String(startMs),
      dataset: [
        {
          dataSourceId:
            'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps',
          point: intVals.map((intVal) => ({ value: [{ intVal }] })),
        },
      ],
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null for null input', () => {
    expect(_normalizeHourlyBuckets(null)).toBeNull();
  });

  it('returns null for an empty array', () => {
    expect(_normalizeHourlyBuckets([])).toBeNull();
  });

  it('returns a 24-element array for valid bucket data', () => {
    const buckets = [makeHourlyBucket(0, [1000]), makeHourlyBucket(12, [500])];
    const result = _normalizeHourlyBuckets(buckets);
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(24);
  });

  it('places step totals at the correct local hour index', () => {
    const buckets = [
      makeHourlyBucket(0, [1000, 200]),
      makeHourlyBucket(3, [500]),
      makeHourlyBucket(23, [750]),
    ];
    const result = _normalizeHourlyBuckets(buckets);
    expect(result[0]).toBe(1200);
    expect(result[3]).toBe(500);
    expect(result[23]).toBe(750);
  });

  it('zero-pads missing hour slots — partial bucket list has no undefined or sparse holes', () => {
    const buckets = [makeHourlyBucket(5, [1000])]; // only hour 5 present
    const result = _normalizeHourlyBuckets(buckets);
    expect(result.length).toBe(24);
    expect(result[5]).toBe(1000);
    for (let h = 0; h < 24; h += 1) {
      if (h !== 5) expect(result[h]).toBe(0);
    }
  });

  it('all 24 slots are defined — no sparse holes for any partial input', () => {
    const result = _normalizeHourlyBuckets([makeHourlyBucket(10, [300])]);
    for (let i = 0; i < 24; i += 1) {
      expect(result[i]).toBeDefined();
      expect(typeof result[i]).toBe('number');
    }
  });

  it('returns a full 24-element array with correct per-hour totals for a complete 24-bucket payload', () => {
    // Build 24 buckets, one per local hour, with steps = hour * 100.
    const buckets = Array.from({ length: 24 }, (_, h) => makeHourlyBucket(h, [h * 100]));
    const result = _normalizeHourlyBuckets(buckets);
    expect(result.length).toBe(24);
    for (let h = 0; h < 24; h += 1) {
      expect(result[h]).toBe(h * 100);
    }
  });
});
