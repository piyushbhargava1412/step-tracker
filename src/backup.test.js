import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ─── Module-level export tests (no factory needed) ───────────────────────────

describe('module-level exports', () => {
  it('BACKUP_SCHEMA_VERSION is a non-empty named export', async () => {
    const { BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    expect(BACKUP_SCHEMA_VERSION).toBeTruthy();
  });

  it('BACKUP_FILENAME_PREFIX is a non-empty string export', async () => {
    const { BACKUP_FILENAME_PREFIX } = await import('./backup.js');
    expect(typeof BACKUP_FILENAME_PREFIX).toBe('string');
    expect(BACKUP_FILENAME_PREFIX.length).toBeGreaterThan(0);
  });

  it('blobToBase64 is a named module-level export', async () => {
    const { blobToBase64 } = await import('./backup.js');
    expect(typeof blobToBase64).toBe('function');
  });

  it('base64ToBlob is a named module-level export', async () => {
    const { base64ToBlob } = await import('./backup.js');
    expect(typeof base64ToBlob).toBe('function');
  });

  it('_validateEnvelope is a named module-level export', async () => {
    const { _validateEnvelope } = await import('./backup.js');
    expect(typeof _validateEnvelope).toBe('function');
  });
});

// ─── Engine isolation scan ────────────────────────────────────────────────────

describe('engine isolation', () => {
  it('module source has no document, window, or bare Dexie import', () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(__dirname, 'backup.js'), 'utf-8');
    expect(src).not.toMatch(/\bdocument\b/);
    expect(src).not.toMatch(/\bwindow\b/);
    expect(src).not.toMatch(/import.*from ['"]dexie['"]/);
  });
});

// ─── createBackup / buildBackup ───────────────────────────────────────────────

function makeDb({ records = [], settings = [], throwOnRead = false } = {}) {
  return {
    daily_records: {
      toArray: throwOnRead
        ? vi.fn().mockRejectedValue(new Error('read failed'))
        : vi.fn().mockResolvedValue(records),
    },
    settings: {
      toArray: throwOnRead
        ? vi.fn().mockRejectedValue(new Error('read failed'))
        : vi.fn().mockResolvedValue(settings),
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('createBackup', () => {
  it('is a factory function', async () => {
    const { createBackup } = await import('./backup.js');
    expect(typeof createBackup).toBe('function');
  });
});

describe('buildBackup()', () => {
  it('returns an envelope with schema_version === BACKUP_SCHEMA_VERSION', async () => {
    const { createBackup, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const db = makeDb();
    const { buildBackup } = createBackup(db);
    const envelope = await buildBackup();
    expect(envelope.schema_version).toBe(BACKUP_SCHEMA_VERSION);
  });

  it('returns envelope with exported_at as an ISO string', async () => {
    const { createBackup } = await import('./backup.js');
    const db = makeDb();
    const { buildBackup } = createBackup(db);
    const envelope = await buildBackup();
    expect(typeof envelope.exported_at).toBe('string');
    expect(new Date(envelope.exported_at).toString()).not.toBe('Invalid Date');
  });

  it('returns empty arrays when store is empty', async () => {
    const { createBackup } = await import('./backup.js');
    const db = makeDb();
    const { buildBackup } = createBackup(db);
    const envelope = await buildBackup();
    expect(Array.isArray(envelope.daily_records)).toBe(true);
    expect(envelope.daily_records).toHaveLength(0);
    expect(Array.isArray(envelope.settings)).toBe(true);
    expect(envelope.settings).toHaveLength(0);
  });

  it('includes all daily_records fields verbatim', async () => {
    const { createBackup } = await import('./backup.js');
    const record = {
      date: '2024-01-15',
      original_steps: 8000,
      original_distance_km: 6.4,
      effective_steps: 9000,
      effective_distance_km: 7.2,
      is_overridden: true,
      override: { note: 'manual', proof_image_base64: null },
      synced_at: '2024-01-15T10:00:00.000Z',
    };
    const db = makeDb({ records: [record] });
    const { buildBackup } = createBackup(db);
    const envelope = await buildBackup();
    expect(envelope.daily_records).toHaveLength(1);
    const r = envelope.daily_records[0];
    expect(r.date).toBe(record.date);
    expect(r.original_steps).toBe(record.original_steps);
    expect(r.original_distance_km).toBe(record.original_distance_km);
    expect(r.effective_steps).toBe(record.effective_steps);
    expect(r.effective_distance_km).toBe(record.effective_distance_km);
    expect(r.is_overridden).toBe(record.is_overridden);
    expect(r.override).toEqual(record.override);
    expect(r.synced_at).toBe(record.synced_at);
  });

  it('includes override.proof_image_base64 data-URL verbatim', async () => {
    const { createBackup } = await import('./backup.js');
    const proofDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
    const record = {
      date: '2024-01-15',
      original_steps: 8000,
      original_distance_km: 6.4,
      effective_steps: 8000,
      effective_distance_km: 6.4,
      is_overridden: true,
      override: { note: 'proof', proof_image_base64: proofDataUrl },
      synced_at: '2024-01-15T10:00:00.000Z',
    };
    const db = makeDb({ records: [record] });
    const { buildBackup } = createBackup(db);
    const envelope = await buildBackup();
    expect(envelope.daily_records[0].override.proof_image_base64).toBe(proofDataUrl);
  });

  it('includes settings rows verbatim with multi-shape support', async () => {
    const { createBackup } = await import('./backup.js');
    const settings = [
      { key: 'sync_anchor_date', value: '2024-01-01' },
      { key: 'active_step_goal', target_steps: 10000 },
      { key: 'initial_backfill_complete', value: true },
    ];
    const db = makeDb({ settings });
    const { buildBackup } = createBackup(db);
    const envelope = await buildBackup();
    expect(envelope.settings).toHaveLength(3);
    expect(envelope.settings[0]).toEqual(settings[0]);
    expect(envelope.settings[1]).toEqual(settings[1]);
    expect(envelope.settings[2]).toEqual(settings[2]);
  });

  it('Dexie read error — console.error([backup], err) called and promise rejects', async () => {
    const { createBackup } = await import('./backup.js');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = makeDb({ throwOnRead: true });
    const { buildBackup } = createBackup(db);
    await expect(buildBackup()).rejects.toThrow('read failed');
    expect(errSpy).toHaveBeenCalledWith('[backup]', expect.any(Error));
  });
});

// ─── blobToBase64 ─────────────────────────────────────────────────────────────

describe('blobToBase64()', () => {
  it('converts a Blob to a data: string', async () => {
    const { blobToBase64 } = await import('./backup.js');
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const result = await blobToBase64(blob);
    expect(typeof result).toBe('string');
    expect(result.startsWith('data:')).toBe(true);
  });
});
