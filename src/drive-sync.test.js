/**
 * Tests for src/drive-sync.js — Drive v3 AppData gateway.
 * All Drive API calls go through injected fetchFn; no globals touched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  createDriveSync,
  DRIVE_APPDATA_FILE_NAME,
  DRIVE_API_BASE_URL,
} from './drive-sync.js';

const MODULE_PATH = path.resolve(__dirname, 'drive-sync.js');

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

// ─── Static source scans ──────────────────────────────────────────────────────

describe('DI isolation (static scan)', () => {
  let source;
  beforeEach(() => {
    source = fs.readFileSync(MODULE_PATH, 'utf-8');
  });

  it('uses only fetchFn (injected) — no bare fetch( calls', () => {
    // Allow `fetchFn(` but disallow `fetch(` that is not preceded by 'Fn'
    const bareFetchMatches = source.match(/(?<!Fn)\bfetch\s*\(/g);
    expect(bareFetchMatches).toBeNull();
  });

  it('uses only injected getAccessToken — no window. references', () => {
    expect(source).not.toMatch(/\bwindow\b/);
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

  it('returns gracefully without calling fetchFn when getAccessToken returns null', async () => {
    getAccessToken.mockReturnValue(null);

    await driveSync.push(envelope);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(reporter.auth).toHaveBeenCalled();
  });

  it('catches non-2xx response on push, logs error with [drive-sync] prefix, notifies reporter', async () => {
    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [] }))
      .mockResolvedValueOnce(makeErrorResponse(500));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await driveSync.push(envelope);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[drive-sync]'),
      expect.anything()
    );
    expect(reporter.db).toHaveBeenCalled();
  });

  it('does not throw on push network error', async () => {
    fetchFn
      .mockResolvedValueOnce(makeOkResponse({ files: [] }))
      .mockRejectedValueOnce(new TypeError('Network failure'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(driveSync.push(envelope)).resolves.not.toThrow();
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
});
