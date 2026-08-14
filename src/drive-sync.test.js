/**
 * Tests for src/drive-sync.js — Drive v3 AppData gateway.
 * All Drive API calls go through injected fetchFn; no globals touched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createDriveSync,
  DRIVE_APPDATA_FILE_NAME,
  DRIVE_API_BASE_URL,
  DRIVE_PUSH_SKIPPED,
} from './drive-sync.js';
import { _validateEnvelope } from './backup.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReporter() {
  return { auth: vi.fn(), db: vi.fn(), sync: vi.fn() };
}

function makeOkResponse(body) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

function makeErrorResponse(status = 500) {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({ error: { message: 'Server error' } }),
    text: vi.fn().mockResolvedValue('Server error'),
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('DRIVE_APPDATA_FILE_NAME matches the exact AppData backup filename', () => {
    expect(DRIVE_APPDATA_FILE_NAME).toBe('step_tracker_backup.json');
  });

  it('DRIVE_API_BASE_URL matches the exact Drive v3 API base URL', () => {
    expect(DRIVE_API_BASE_URL).toBe('https://www.googleapis.com');
  });
});

// ─── DI isolation (runtime) ───────────────────────────────────────────────────

describe('DI isolation (runtime)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const envelope = {
    schema_version: 1,
    exported_at: '2026-01-01T00:00:00.000Z',
    daily_records: [],
    settings: [],
  };

  it('uses only the injected fetchFn — the bare global fetch is never consulted', async () => {
    const globalFetch = vi.fn(() => Promise.reject(new Error('bare global fetch must never be used')));
    vi.stubGlobal('fetch', globalFetch);

    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse({ files: [] }));
    const getAccessToken = vi.fn().mockReturnValue('test-token-123');
    const driveSync = createDriveSync({ getAccessToken, reporter: makeReporter(), fetchFn });

    await driveSync.find();
    await driveSync.pull();
    await driveSync.push(envelope);

    expect(globalFetch).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalled();
  });

  it('never touches the DOM or renders during find/push/pull', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse({ files: [] }));
    const getAccessToken = vi.fn().mockReturnValue('test-token-123');
    const innerHTMLSetter = vi.spyOn(Element.prototype, 'innerHTML', 'set');

    const driveSync = createDriveSync({ getAccessToken, reporter: makeReporter(), fetchFn });

    await driveSync.find();
    await driveSync.push(envelope);

    expect(innerHTMLSetter).not.toHaveBeenCalled();
  });

  it('keeps the backup module out of its public surface (export-shape isolation)', async () => {
    const driveSyncExports = Object.keys(await import('./drive-sync.js'));
    const backupExports = Object.keys(await import('./backup.js'));
    const overlap = driveSyncExports.filter((name) => backupExports.includes(name));
    expect(overlap).toEqual([]);
  });
});

// ─── createDriveSync — find() ─────────────────────────────────────────────────

describe('createDriveSync — find()', () => {
  let fetchFn, reporter, getAccessToken, driveSync;

  beforeEach(() => {
    fetchFn = vi.fn();
    reporter = makeReporter();
    getAccessToken = vi.fn().mockReturnValue('test-token-123');
    driveSync = createDriveSync({ getAccessToken, reporter, fetchFn });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('issues GET to appDataFolder list endpoint with Authorization header', async () => {
    fetchFn.mockResolvedValue(
      makeOkResponse({ files: [{ id: 'file-id-abc', name: DRIVE_APPDATA_FILE_NAME }] })
    );

    await driveSync.find();

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toContain('spaces=appDataFolder');
    expect(opts?.headers?.Authorization).toBe('Bearer test-token-123');
    expect(opts?.method ?? 'GET').toBe('GET');
  });

  it('returns the file ID when API returns a non-empty files array', async () => {
    fetchFn.mockResolvedValue(
      makeOkResponse({ files: [{ id: 'file-id-abc', name: DRIVE_APPDATA_FILE_NAME }] })
    );

    const result = await driveSync.find();

    expect(result).toBe('file-id-abc');
  });

  it('returns null when API returns files: []', async () => {
    fetchFn.mockResolvedValue(makeOkResponse({ files: [] }));

    const result = await driveSync.find();

    expect(result).toBeNull();
  });

  it('returns null on non-2xx response and logs error', async () => {
    fetchFn.mockResolvedValue(makeErrorResponse(500));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await driveSync.find();

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[drive-sync]'),
      expect.anything()
    );
  });

  it('returns null on network error (thrown fetchFn) and logs error', async () => {
    fetchFn.mockRejectedValue(new TypeError('Failed to fetch'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await driveSync.find();

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[drive-sync]'),
      expect.anything()
    );
  });

  it('returns gracefully without calling fetchFn when getAccessToken returns null', async () => {
    getAccessToken.mockReturnValue(null);

    const result = await driveSync.find();

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
    expect(reporter.auth).toHaveBeenCalled();
  });
});

// ─── createDriveSync — push() ─────────────────────────────────────────────────

describe('createDriveSync — push()', () => {
  let fetchFn, reporter, getAccessToken, driveSync;
  const envelope = { schema_version: 1, exported_at: '2026-01-01T00:00:00.000Z', daily_records: [], settings: [] };

  beforeEach(() => {
    fetchFn = vi.fn();
    reporter = makeReporter();
    getAccessToken = vi.fn().mockReturnValue('test-token-123');
    driveSync = createDriveSync({ getAccessToken, reporter, fetchFn });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('issues multipart POST when no existing file (find returns null)', async () => {
    // First call: find() → empty list; second call: create
    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [] }))
      .mockResolvedValueOnce(makeOkResponse({ id: 'new-file-id' }));

    await driveSync.push(envelope);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [url, opts] = fetchFn.mock.calls[1];
    expect(url).toContain('uploadType=multipart');
    expect(opts.method).toBe('POST');
    // Content-Type should indicate multipart
    expect(opts.headers['Content-Type']).toContain('multipart/related');
  });

  it('uses a fresh per-call boundary — never the static drive_sync_boundary_xyz', async () => {
    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [] }))
      .mockResolvedValueOnce(makeOkResponse({ id: 'new-file-id' }));

    await driveSync.push(envelope);

    const [, opts] = fetchFn.mock.calls[1];
    const contentType = opts.headers['Content-Type'];
    const boundary = /boundary=([^;]+)/.exec(contentType)?.[1];
    expect(boundary).toBeTruthy();
    expect(boundary).not.toBe('drive_sync_boundary_xyz');
    // The boundary must appear as the MIME delimiter in the body…
    expect(opts.body).toContain(`--${boundary}\r\n`);
    expect(opts.body.endsWith(`--${boundary}--`)).toBe(true);
    // …and the old static literal must be gone from both header and body.
    expect(contentType).not.toContain('drive_sync_boundary_xyz');
    expect(opts.body).not.toContain('drive_sync_boundary_xyz');
  });

  it('never embeds the boundary inside the serialised content (RFC 2046)', async () => {
    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [] }))
      .mockResolvedValueOnce(makeOkResponse({ id: 'new-file-id' }));

    await driveSync.push(envelope);

    const [, opts] = fetchFn.mock.calls[1];
    const boundary = /boundary=([^;]+)/.exec(opts.headers['Content-Type'])?.[1];
    const sections = opts.body.split(`--${boundary}`);
    // Exactly 2 part-openers + 1 closer → 3 delimiters → 4 sections.
    expect(sections).toHaveLength(4);
    for (const section of sections.slice(1, -1)) {
      expect(section).not.toContain(boundary);
    }
  });

  it('generates a different boundary for each push() call', async () => {
    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [] }))
      .mockResolvedValueOnce(makeOkResponse({ id: 'new-file-id' }))
      .mockResolvedValueOnce(makeOkResponse({ files: [] }))
      .mockResolvedValueOnce(makeOkResponse({ id: 'new-file-id' }));

    await driveSync.push(envelope);
    await driveSync.push(envelope);

    const boundaryOfCall = (callIndex) =>
      /boundary=([^;]+)/.exec(fetchFn.mock.calls[callIndex][1].headers['Content-Type'])?.[1];
    const first = boundaryOfCall(1);
    const second = boundaryOfCall(3);
    expect(first).not.toEqual(second);
  });

  it('issues multipart PATCH when find returns an existing file ID', async () => {
    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [{ id: 'existing-id' }] }))
      .mockResolvedValueOnce(makeOkResponse({ id: 'existing-id' }));

    await driveSync.push(envelope);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [url, opts] = fetchFn.mock.calls[1];
    expect(url).toContain('existing-id');
    expect(opts.method).toBe('PATCH');
  });

  it('second push() reuses the cached file ID — no List/find round-trip', async () => {
    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [{ id: 'cached-id' }] })) // find warms the cache
      .mockResolvedValueOnce(makeOkResponse({ id: 'cached-id' })) // first push PATCH
      .mockResolvedValueOnce(makeOkResponse({ id: 'cached-id' })); // second push: PATCH only

    await driveSync.push(envelope);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    await driveSync.push(envelope);

    // The cached ID short-circuits the List endpoint — exactly one new call.
    expect(fetchFn).toHaveBeenCalledTimes(3);
    const [url, opts] = fetchFn.mock.calls[2];
    expect(url).toContain('cached-id');
    expect(url).not.toContain('spaces=appDataFolder');
    expect(opts.method).toBe('PATCH');
  });

  it('404 on a cached-ID PATCH invalidates the cache, re-runs find(), then re-creates via POST', async () => {
    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [{ id: 'cached-id' }] })) // find warms the cache
      .mockResolvedValueOnce(makeOkResponse({ id: 'cached-id' })) // first push PATCH
      .mockResolvedValueOnce(makeErrorResponse(404)) // second push PATCH → 404
      .mockResolvedValueOnce(makeOkResponse({ files: [] })) // fallback find → not found
      .mockResolvedValueOnce(makeOkResponse({ id: 'recreated-id' })); // fallback POST create

    await driveSync.push(envelope);
    await expect(driveSync.push(envelope)).resolves.toBeUndefined();

    expect(fetchFn).toHaveBeenCalledTimes(5);
    const calls = fetchFn.mock.calls;
    expect(calls[2][0]).toContain('cached-id');
    expect(calls[2][1].method).toBe('PATCH');
    expect(calls[3][0]).toContain('spaces=appDataFolder');
    expect(calls[3][1].method).toBe('GET');
    expect(calls[4][0]).toContain('uploadType=multipart');
    expect(calls[4][1].method).toBe('POST');
  });

  it('returns gracefully without calling fetchFn when getAccessToken returns null (no throw)', async () => {
    getAccessToken.mockReturnValue(null);

    await expect(driveSync.push(envelope)).resolves.toBe(DRIVE_PUSH_SKIPPED);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(reporter.auth).toHaveBeenCalled();
  });

  it('no-token push resolves to the exported skip sentinel — never undefined', async () => {
    getAccessToken.mockReturnValue(null);

    const result = await driveSync.push(envelope);

    expect(result).not.toBeUndefined();
    expect(result).toBe(DRIVE_PUSH_SKIPPED);
    expect(result.skipped).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(reporter.auth).toHaveBeenCalled();
  });

  it('rejects on non-2xx response with a GENERIC error — the HTTP status lives in console.error only', async () => {
    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [] }))
      .mockResolvedValueOnce(makeErrorResponse(500));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const thrown = await driveSync.push(envelope).catch((e) => e);

    // The thrown error is what drive-sync-ui interpolates into the DOM — it
    // must never disclose the backend HTTP status.
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message).not.toMatch(/HTTP\s+\d+/);
    expect(thrown.message).not.toContain('500');
    // Reporter copy is generic — no HTTP status in any reporter message.
    expect(reporter.db).toHaveBeenCalled();
    for (const [msg] of reporter.db.mock.calls) {
      expect(msg).not.toMatch(/HTTP\s+\d+/);
      expect(msg).not.toMatch(/\b500\b/);
    }
    // The status-bearing diagnostic goes to the console only.
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[drive-sync]'),
      expect.objectContaining({ message: expect.stringContaining('HTTP 500') })
    );
  });

  it('rejects when the upload fetch rejects (network error)', async () => {
    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [] }))
      .mockRejectedValueOnce(new TypeError('Network failure'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(driveSync.push(envelope)).rejects.toThrow('Network failure');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[drive-sync]'),
      expect.anything()
    );
    // Reporter copy stays generic even on network errors.
    expect(reporter.db).toHaveBeenCalled();
    for (const [msg] of reporter.db.mock.calls) {
      expect(msg).not.toMatch(/HTTP\s+\d+/);
    }
  });

  it('push(envelope, { silent: true }) on non-2xx — rejects and logs, but surfaces nothing to the user', async () => {
    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [] }))
      .mockResolvedValueOnce(makeErrorResponse(500));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(driveSync.push(envelope, { silent: true })).rejects.toBeInstanceOf(Error);
    expect(reporter.db).not.toHaveBeenCalled();
    expect(reporter.auth).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[drive-sync]'),
      expect.objectContaining({ message: expect.stringContaining('HTTP 500') })
    );
  });

  it('push(envelope, { silent: true }) on network error — rejects and logs, but surfaces nothing to the user', async () => {
    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [] }))
      .mockRejectedValueOnce(new TypeError('Network failure'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(driveSync.push(envelope, { silent: true })).rejects.toThrow('Network failure');
    expect(reporter.db).not.toHaveBeenCalled();
    expect(reporter.auth).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[drive-sync]'),
      expect.anything()
    );
  });

  it('push(envelope, { silent: true }) with no token — resolves to the skip sentinel and surfaces nothing', async () => {
    getAccessToken.mockReturnValue(null);

    await expect(driveSync.push(envelope, { silent: true })).resolves.toBe(DRIVE_PUSH_SKIPPED);
    expect(reporter.auth).not.toHaveBeenCalled();
    expect(reporter.db).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

// ─── createDriveSync — pull() ─────────────────────────────────────────────────

describe('createDriveSync — pull()', () => {
  let fetchFn, reporter, getAccessToken, driveSync;
  const storedEnvelope = { schema_version: 1, exported_at: '2026-01-01T00:00:00.000Z', daily_records: [], settings: [] };

  beforeEach(() => {
    fetchFn = vi.fn();
    reporter = makeReporter();
    getAccessToken = vi.fn().mockReturnValue('test-token-123');
    driveSync = createDriveSync({ getAccessToken, reporter, fetchFn });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed JSON envelope when file exists', async () => {
    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [{ id: 'file-id-xyz' }] }))
      .mockResolvedValueOnce(makeOkResponse(storedEnvelope));

    const result = await driveSync.pull();

    expect(result).toEqual(storedEnvelope);
  });

  it('pull() populates the cache so a later push() skips the find() round-trip', async () => {
    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [{ id: 'found-id' }] })) // pull find
      .mockResolvedValueOnce(makeOkResponse(storedEnvelope)) // pull content
      .mockResolvedValueOnce(makeOkResponse({ id: 'found-id' })); // push PATCH only

    await driveSync.pull();
    expect(fetchFn).toHaveBeenCalledTimes(2);

    await driveSync.push(storedEnvelope);

    expect(fetchFn).toHaveBeenCalledTimes(3);
    const [url, opts] = fetchFn.mock.calls[2];
    expect(url).toContain('found-id');
    expect(url).not.toContain('spaces=appDataFolder');
    expect(opts.method).toBe('PATCH');
  });

  it('returns null without calling fetchFn for content when find returns null', async () => {
    fetchFn.mockResolvedValueOnce(makeOkResponse({ files: [] }));

    const result = await driveSync.pull();

    expect(result).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1); // only find call
  });

  it('returns gracefully without calling fetchFn when getAccessToken returns null', async () => {
    getAccessToken.mockReturnValue(null);

    const result = await driveSync.pull();

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
    expect(reporter.auth).toHaveBeenCalled();
  });

  it('catches network error on pull and resolves without throw', async () => {
    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [{ id: 'file-id-xyz' }] }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(driveSync.pull()).resolves.not.toThrow();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[drive-sync]'),
      expect.anything()
    );
  });

  it('runs the pulled envelope through the injected validator before returning it', async () => {
    const validator = vi.fn();
    driveSync = createDriveSync({ getAccessToken, reporter, fetchFn, validator });

    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [{ id: 'file-id-xyz' }] }))
      .mockResolvedValueOnce(makeOkResponse(storedEnvelope));

    const result = await driveSync.pull();

    expect(validator).toHaveBeenCalledWith(storedEnvelope);
    expect(result).toEqual(storedEnvelope);
  });

  it('rejects a tampered __proto__-polluting payload pulled from Drive (TypeError; reporter ❌)', async () => {
    const tampered = JSON.parse(
      '{"schema_version":1,"exported_at":"2026-01-01T00:00:00.000Z",' +
        '"daily_records":[{"date":"2024-01-15","__proto__":{"polluted":true}}],"settings":[]}'
    );
    driveSync = createDriveSync({
      getAccessToken,
      reporter,
      fetchFn,
      validator: _validateEnvelope,
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [{ id: 'file-id-xyz' }] }))
      .mockResolvedValueOnce(makeOkResponse(tampered));

    await expect(driveSync.pull()).rejects.toThrow(TypeError);
    expect(reporter.db).toHaveBeenCalledWith(expect.stringContaining('❌'));
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[drive-sync]'),
      expect.anything()
    );
  });
});
