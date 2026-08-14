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

// ─── base64ToBlob ─────────────────────────────────────────────────────────────

describe('base64ToBlob()', () => {
  it('converts a data: string back to a Blob', async () => {
    const { base64ToBlob, blobToBase64 } = await import('./backup.js');
    const original = new Blob(['hello'], { type: 'text/plain' });
    const dataUrl = await blobToBase64(original);
    const result = base64ToBlob(dataUrl);
    expect(result).toBeInstanceOf(Blob);
    const buf = await result.arrayBuffer();
    expect(buf.byteLength).toBe(5); // 'hello' is 5 bytes
  });
});

// ─── _validateEnvelope (Task 2) ───────────────────────────────────────────────

describe('_validateEnvelope() — Task 2', () => {
  it('does not throw on a valid schema-v1 envelope', async () => {
    const { _validateEnvelope, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const envelope = {
      schema_version: BACKUP_SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      daily_records: [],
      settings: [],
    };
    expect(() => _validateEnvelope(envelope)).not.toThrow();
  });

  it('throws TypeError when schema_version is absent', async () => {
    const { _validateEnvelope } = await import('./backup.js');
    const envelope = { exported_at: 'x', daily_records: [], settings: [] };
    expect(() => _validateEnvelope(envelope)).toThrow(TypeError);
  });

  it('throws TypeError for unknown future schema_version integer', async () => {
    const { _validateEnvelope } = await import('./backup.js');
    const envelope = { schema_version: 9999, daily_records: [], settings: [] };
    expect(() => _validateEnvelope(envelope)).toThrow(TypeError);
  });

  it('throws TypeError when daily_records is null', async () => {
    const { _validateEnvelope, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const envelope = { schema_version: BACKUP_SCHEMA_VERSION, daily_records: null, settings: [] };
    expect(() => _validateEnvelope(envelope)).toThrow(TypeError);
  });

  it('throws TypeError when settings is a string', async () => {
    const { _validateEnvelope, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const envelope = {
      schema_version: BACKUP_SCHEMA_VERSION,
      daily_records: [],
      settings: 'wrong',
    };
    expect(() => _validateEnvelope(envelope)).toThrow(TypeError);
  });
});

// ─── restoreBackup() (Task 2) ─────────────────────────────────────────────────

/**
 * Creates a db mock that supports transaction('rw', table1, table2, cb).
 * The callback receives the db itself so bulkPut calls are tracked.
 * Stored records are kept in `_records` and `_settings` for inspection.
 * If `throwInTransaction` is true, the callback throws after the first bulkPut.
 */
function makeTransactionalDb({
  initialRecords = [],
  initialSettings = [],
  throwInTransaction = false,
} = {}) {
  // Mutable store state — clone so we can check pre/post
  let records = [...initialRecords];
  let settings = [...initialSettings];

  const db = {
    daily_records: {
      toArray: vi.fn().mockImplementation(() => Promise.resolve([...records])),
      bulkPut: vi.fn().mockImplementation((rows) => {
        if (throwInTransaction) {
          throw new Error('simulated transaction failure');
        }
        records = [...rows];
        return Promise.resolve();
      }),
    },
    settings: {
      toArray: vi.fn().mockImplementation(() => Promise.resolve([...settings])),
      bulkPut: vi.fn().mockImplementation((rows) => {
        settings = [...rows];
        return Promise.resolve();
      }),
    },
    _getRecords: () => [...records],
    _getSettings: () => [...settings],
  };

  // transaction('rw', table1, table2, cb) — runs cb inside a try/catch to simulate atomicity
  db.transaction = vi.fn().mockImplementation(async (_mode, _t1, _t2, cb) => {
    // Snapshot pre-state for rollback simulation
    const snapshotRecords = [...records];
    const snapshotSettings = [...settings];
    try {
      await cb();
    } catch (err) {
      // Simulate Dexie rollback: restore pre-state
      records = snapshotRecords;
      settings = snapshotSettings;
      throw err;
    }
  });

  return db;
}

describe('restoreBackup()', () => {
  it('executes a single Dexie rw transaction', async () => {
    const { createBackup, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const db = makeTransactionalDb();
    const { restoreBackup } = createBackup(db);
    const envelope = {
      schema_version: BACKUP_SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      daily_records: [{ date: '2024-01-01', original_steps: 1000 }],
      settings: [{ key: 'sync_anchor_date', value: '2024-01-01' }],
    };
    await restoreBackup(envelope);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.transaction.mock.calls[0][0]).toBe('rw');
  });

  it('calls bulkPut on both daily_records and settings inside the transaction', async () => {
    const { createBackup, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const db = makeTransactionalDb();
    const { restoreBackup } = createBackup(db);
    const records = [{ date: '2024-01-01', original_steps: 5000 }];
    const settings = [{ key: 'active_step_goal', target_steps: 10000 }];
    const envelope = {
      schema_version: BACKUP_SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      daily_records: records,
      settings,
    };
    await restoreBackup(envelope);
    expect(db.daily_records.bulkPut).toHaveBeenCalledWith(records);
    expect(db.settings.bulkPut).toHaveBeenCalledWith(settings);
  });

  it('round-trip: buildBackup then restoreBackup reproduces the original store exactly', async () => {
    const { createBackup, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const proofUrl = 'data:image/jpeg;base64,/9j/4AAQ';
    const originalRecords = [
      {
        date: '2024-01-10',
        original_steps: 8500,
        original_distance_km: 6.8,
        effective_steps: 9200,
        effective_distance_km: 7.4,
        is_overridden: true,
        override: { note: 'manual', proof_image_base64: proofUrl },
        synced_at: '2024-01-10T12:00:00.000Z',
      },
    ];
    const originalSettings = [
      { key: 'sync_anchor_date', value: '2024-01-01' },
      { key: 'active_step_goal', target_steps: 10000 },
    ];
    const db = makeTransactionalDb({
      initialRecords: originalRecords,
      initialSettings: originalSettings,
    });
    const { buildBackup, restoreBackup } = createBackup(db);
    const envelope = await buildBackup();
    expect(envelope.schema_version).toBe(BACKUP_SCHEMA_VERSION);
    // Wipe the store before restore
    db.daily_records.toArray.mockResolvedValue([]);
    db.settings.toArray.mockResolvedValue([]);
    await restoreBackup(envelope);
    // After restore, the mutable store should match original
    expect(db._getRecords()).toEqual(originalRecords);
    expect(db._getSettings()).toEqual(originalSettings);
  });

  it('proof_image_base64 round-trips unchanged', async () => {
    const { createBackup, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const proofUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
    const db = makeTransactionalDb({
      initialRecords: [
        {
          date: '2024-01-15',
          override: { proof_image_base64: proofUrl },
        },
      ],
    });
    const { buildBackup, restoreBackup } = createBackup(db);
    const envelope = await buildBackup();
    await restoreBackup(envelope);
    const restored = db._getRecords();
    expect(restored[0].override.proof_image_base64).toBe(proofUrl);
  });

  it('record with override: null restores without TypeError', async () => {
    const { createBackup, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const db = makeTransactionalDb({
      initialRecords: [{ date: '2024-01-16', override: null }],
    });
    const { buildBackup, restoreBackup } = createBackup(db);
    const envelope = await buildBackup();
    await expect(restoreBackup(envelope)).resolves.not.toThrow();
  });

  it('record with no override key restores cleanly', async () => {
    const { createBackup, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const db = makeTransactionalDb({
      initialRecords: [{ date: '2024-01-17', original_steps: 5000 }],
    });
    const { buildBackup, restoreBackup } = createBackup(db);
    const envelope = await buildBackup();
    await expect(restoreBackup(envelope)).resolves.not.toThrow();
  });

  it('throws TypeError on malformed input and does not call transaction', async () => {
    const { createBackup } = await import('./backup.js');
    const db = makeTransactionalDb();
    const { restoreBackup } = createBackup(db);
    await expect(restoreBackup({ schema_version: 999, daily_records: [], settings: [] })).rejects.toThrow(TypeError);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('mid-transaction failure rolls back — store unchanged', async () => {
    const { createBackup, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const preRecords = [{ date: '2024-01-20', original_steps: 3000 }];
    const preSettings = [{ key: 'sync_anchor_date', value: '2024-01-01' }];
    const db = makeTransactionalDb({
      initialRecords: preRecords,
      initialSettings: preSettings,
      throwInTransaction: true,
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { restoreBackup } = createBackup(db);
    const envelope = {
      schema_version: BACKUP_SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      daily_records: [{ date: '2024-01-21', original_steps: 9999 }],
      settings: [{ key: 'active_step_goal', target_steps: 12000 }],
    };
    await expect(restoreBackup(envelope)).rejects.toThrow('simulated transaction failure');
    // Rollback: store must be at pre-restore state
    expect(db._getRecords()).toEqual(preRecords);
    expect(db._getSettings()).toEqual(preSettings);
    expect(errSpy).toHaveBeenCalledWith('[backup]', expect.any(Error));
  });
});

// ─── _validateEnvelope hardening — per-row validation (Task 10) ──────────────

function makeRow(overrides = {}) {
  return {
    date: '2024-01-01',
    original_steps: 8000,
    effective_steps: 8000,
    original_distance_km: 6.4,
    effective_distance_km: 6.4,
    ...overrides,
  };
}

function makeEnvelope({ records = [makeRow()], settings = [{ key: 'active_step_goal', target_steps: 10000 }] } = {}) {
  return {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    daily_records: records,
    settings,
  };
}

describe('_validateEnvelope() — Task 10 per-row validation', () => {
  it('MAX_BACKUP_RECORDS and MAX_BACKUP_BYTES are positive number exports', async () => {
    const { MAX_BACKUP_RECORDS, MAX_BACKUP_BYTES } = await import('./backup.js');
    expect(typeof MAX_BACKUP_RECORDS).toBe('number');
    expect(MAX_BACKUP_RECORDS).toBeGreaterThan(0);
    expect(typeof MAX_BACKUP_BYTES).toBe('number');
    expect(MAX_BACKUP_BYTES).toBeGreaterThan(0);
  });

  it('accepts a valid multi-field daily_record row', async () => {
    const { _validateEnvelope, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const envelope = makeEnvelope({ records: [makeRow()] });
    envelope.schema_version = BACKUP_SCHEMA_VERSION;
    expect(() => _validateEnvelope(envelope)).not.toThrow();
  });

  it('rejects a daily_record row carrying a __proto__ key', async () => {
    const { _validateEnvelope, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const row = JSON.parse(
      '{"date":"2024-01-01","original_steps":8000,"__proto__":{"polluted":true}}'
    );
    const envelope = makeEnvelope({ records: [row] });
    envelope.schema_version = BACKUP_SCHEMA_VERSION;
    expect(() => _validateEnvelope(envelope)).toThrow(TypeError);
  });

  it('rejects a settings row carrying a constructor key', async () => {
    const { _validateEnvelope, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const settingsRow = JSON.parse('{"key":"x","constructor":{"polluted":true}}');
    const envelope = makeEnvelope({ settings: [settingsRow] });
    envelope.schema_version = BACKUP_SCHEMA_VERSION;
    expect(() => _validateEnvelope(envelope)).toThrow(TypeError);
  });

  it('rejects a daily_record row missing the required date', async () => {
    const { _validateEnvelope, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const envelope = makeEnvelope({ records: [makeRow({ date: undefined })] });
    envelope.schema_version = BACKUP_SCHEMA_VERSION;
    expect(() => _validateEnvelope(envelope)).toThrow(TypeError);
  });

  it('rejects a daily_record row with a non-YYYY-MM-DD date', async () => {
    const { _validateEnvelope, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const envelope = makeEnvelope({ records: [makeRow({ date: '01/15/2024' })] });
    envelope.schema_version = BACKUP_SCHEMA_VERSION;
    expect(() => _validateEnvelope(envelope)).toThrow(TypeError);
  });

  it('rejects a daily_record row with non-numeric original_steps', async () => {
    const { _validateEnvelope, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const envelope = makeEnvelope({ records: [makeRow({ original_steps: 'many' })] });
    envelope.schema_version = BACKUP_SCHEMA_VERSION;
    expect(() => _validateEnvelope(envelope)).toThrow(TypeError);
  });

  it('rejects a daily_record row with non-numeric effective_distance_km', async () => {
    const { _validateEnvelope, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const envelope = makeEnvelope({ records: [makeRow({ effective_distance_km: 'far' })] });
    envelope.schema_version = BACKUP_SCHEMA_VERSION;
    expect(() => _validateEnvelope(envelope)).toThrow(TypeError);
  });

  it('rejects a daily_record row whose override is not an object or null', async () => {
    const { _validateEnvelope, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const envelope = makeEnvelope({ records: [makeRow({ override: 'nope' })] });
    envelope.schema_version = BACKUP_SCHEMA_VERSION;
    expect(() => _validateEnvelope(envelope)).toThrow(TypeError);
  });

  it('rejects a daily_record row whose override.effective_steps is non-numeric', async () => {
    const { _validateEnvelope, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const envelope = makeEnvelope({
      records: [makeRow({ override: { effective_steps: 'ten', reason: 'manual' } })],
    });
    envelope.schema_version = BACKUP_SCHEMA_VERSION;
    expect(() => _validateEnvelope(envelope)).toThrow(TypeError);
  });

  it('rejects a payload exceeding MAX_BACKUP_RECORDS', async () => {
    const { _validateEnvelope, BACKUP_SCHEMA_VERSION, MAX_BACKUP_RECORDS } = await import('./backup.js');
    const records = Array.from({ length: MAX_BACKUP_RECORDS + 1 }, () => makeRow());
    const envelope = makeEnvelope({ records });
    envelope.schema_version = BACKUP_SCHEMA_VERSION;
    expect(() => _validateEnvelope(envelope)).toThrow(TypeError);
  });

  it('rejects a payload whose serialised size exceeds MAX_BACKUP_BYTES', async () => {
    const { _validateEnvelope, BACKUP_SCHEMA_VERSION, MAX_BACKUP_BYTES } = await import('./backup.js');
    const hugeField = 'x'.repeat(MAX_BACKUP_BYTES + 1);
    const envelope = makeEnvelope({ records: [makeRow({ synced_at: hugeField })] });
    envelope.schema_version = BACKUP_SCHEMA_VERSION;
    expect(() => _validateEnvelope(envelope)).toThrow(TypeError);
  });
});

// ─── restoreBackup security boundary — Task 10 ───────────────────────────────

describe('restoreBackup() — Task 10 no write on invalid rows', () => {
  it('rejects a __proto__-polluted daily_record before any transaction', async () => {
    const { createBackup, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const db = makeTransactionalDb();
    const { restoreBackup } = createBackup(db);
    const row = JSON.parse(
      '{"date":"2024-01-01","original_steps":8000,"__proto__":{"polluted":true}}'
    );
    const envelope = {
      schema_version: BACKUP_SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      daily_records: [row],
      settings: [],
    };
    await expect(restoreBackup(envelope)).rejects.toThrow(TypeError);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.daily_records.bulkPut).not.toHaveBeenCalled();
    expect(db.settings.bulkPut).not.toHaveBeenCalled();
  });

  it('rejects an oversized payload before any transaction', async () => {
    const { createBackup, BACKUP_SCHEMA_VERSION, MAX_BACKUP_RECORDS } = await import('./backup.js');
    const db = makeTransactionalDb();
    const { restoreBackup } = createBackup(db);
    const records = Array.from(
      { length: MAX_BACKUP_RECORDS + 1 },
      () => ({ date: '2024-01-01', original_steps: 8000 })
    );
    const envelope = {
      schema_version: BACKUP_SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      daily_records: records,
      settings: [],
    };
    await expect(restoreBackup(envelope)).rejects.toThrow(TypeError);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.daily_records.bulkPut).not.toHaveBeenCalled();
  });

  it('restores a valid envelope including override:null and missing-override rows', async () => {
    const { createBackup, BACKUP_SCHEMA_VERSION } = await import('./backup.js');
    const db = makeTransactionalDb();
    const { restoreBackup } = createBackup(db);
    const envelope = {
      schema_version: BACKUP_SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      daily_records: [
        { date: '2024-01-16', original_steps: 5000, override: null },
        { date: '2024-01-17', original_steps: 6000 },
      ],
      settings: [{ key: 'active_step_goal', target_steps: 10000 }],
    };
    await expect(restoreBackup(envelope)).resolves.not.toThrow();
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
});
