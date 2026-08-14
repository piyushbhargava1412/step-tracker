/**
 * Tests for src/drive-sync.js — Drive v3 AppData gateway.
 * All Drive API calls go through injected fetchFn; no globals touched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createDriveSync,
  DRIVE_APPDATA_FILE_NAME,
  DRIVE_API_BASE_URL,
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
  it('DRIVE_APPDATA_FILE_NAME is a non-empty string', () => {
    expect(typeof DRIVE_APPDATA_FILE_NAME).toBe('string');
    expect(DRIVE_APPDATA_FILE_NAME.length).toBeGreaterThan(0);
  });

  it('DRIVE_API_BASE_URL is a non-empty string', () => {
    expect(typeof DRIVE_API_BASE_URL).toBe('string');
    expect(DRIVE_API_BASE_URL.length).toBeGreaterThan(0);
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

  it('returns gracefully without calling fetchFn when getAccessToken returns null (no throw)', async () => {
    getAccessToken.mockReturnValue(null);

    await expect(driveSync.push(envelope)).resolves.toBeUndefined();

    expect(fetchFn).not.toHaveBeenCalled();
    expect(reporter.auth).toHaveBeenCalled();
  });

  it('rejects on non-2xx response, logs [drive-sync] with status, reporter gets generic message', async () => {
    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [] }))
      .mockResolvedValueOnce(makeErrorResponse(500));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(driveSync.push(envelope)).rejects.toThrow('Drive push failed: HTTP 500');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[drive-sync]'),
      expect.anything()
    );
    expect(reporter.db).toHaveBeenCalled();
    const reporterMsg = reporter.db.mock.calls[0][0];
    expect(reporterMsg).not.toContain('500');
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
