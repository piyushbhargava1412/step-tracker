/**
 * records.test.js — TDD tests for src/records.js
 * Task 2: records.js override/revert capability module
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRecords } from './records.js';
import { KM_TO_STEPS } from './goal.js';

function makeMockDb(row = null) {
  const mockTable = {
    get: vi.fn().mockResolvedValue(row),
    put: vi.fn().mockResolvedValue(undefined),
  };
  return { daily_records: mockTable };
}

const BASE_ROW = {
  date: '2024-01-15',
  original_steps: 5000,
  original_distance_km: 3.81,
  effective_steps: 5000,
  effective_distance_km: 3.81,
  is_overridden: false,
  synced_at: '2024-01-15T10:00:00.000Z',
  override: null,
};

describe('createRecords', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('overrideRecord — happy paths', () => {
    it('writes correct effective_steps, effective_distance_km, is_overridden=true, and override blob', async () => {
      const db = makeMockDb({ ...BASE_ROW });
      const records = createRecords(db);

      await records.overrideRecord('2024-01-15', {
        effective_steps: 8000,
        effective_distance_km: 6.1,
        note: 'Treadmill session',
        proof_image_base64: 'data:image/jpeg;base64,abc',
      });

      expect(db.daily_records.put).toHaveBeenCalledOnce();
      const putArg = db.daily_records.put.mock.calls[0][0];
      expect(putArg.effective_steps).toBe(8000);
      expect(putArg.effective_distance_km).toBe(6.1);
      expect(putArg.is_overridden).toBe(true);
      expect(putArg.override.note).toBe('Treadmill session');
      expect(putArg.override.proof_image_base64).toBe('data:image/jpeg;base64,abc');
      expect(putArg.override.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('preserves original_steps and original_distance_km byte-identical', async () => {
      const db = makeMockDb({ ...BASE_ROW });
      const records = createRecords(db);

      await records.overrideRecord('2024-01-15', {
        effective_steps: 8000,
        note: 'Test',
      });

      const putArg = db.daily_records.put.mock.calls[0][0];
      expect(putArg.original_steps).toBe(5000);
      expect(putArg.original_distance_km).toBe(3.81);
    });

    it('leaves synced_at byte-identical', async () => {
      const db = makeMockDb({ ...BASE_ROW });
      const records = createRecords(db);

      await records.overrideRecord('2024-01-15', {
        effective_steps: 8000,
        note: 'Test',
      });

      const putArg = db.daily_records.put.mock.calls[0][0];
      expect(putArg.synced_at).toBe('2024-01-15T10:00:00.000Z');
    });

    it('derives effective_distance_km from effective_steps / KM_TO_STEPS when blank', async () => {
      const db = makeMockDb({ ...BASE_ROW });
      const records = createRecords(db);

      await records.overrideRecord('2024-01-15', {
        effective_steps: 6566,
        note: 'No distance provided',
      });

      const putArg = db.daily_records.put.mock.calls[0][0];
      expect(putArg.effective_distance_km).toBeCloseTo(6566 / KM_TO_STEPS, 5);
    });

    it('uses explicit effective_distance_km as-is without derivation', async () => {
      const db = makeMockDb({ ...BASE_ROW });
      const records = createRecords(db);

      await records.overrideRecord('2024-01-15', {
        effective_steps: 6566,
        effective_distance_km: 2.5,
        note: 'Explicit distance',
      });

      const putArg = db.daily_records.put.mock.calls[0][0];
      expect(putArg.effective_distance_km).toBe(2.5);
    });

    it('accepts effective_steps = 0 (zero is valid)', async () => {
      const db = makeMockDb({ ...BASE_ROW });
      const records = createRecords(db);

      await expect(
        records.overrideRecord('2024-01-15', { effective_steps: 0, note: 'Rest day' })
      ).resolves.not.toThrow();

      expect(db.daily_records.put).toHaveBeenCalledOnce();
    });

    it('stores proof_image_base64 = null when proof is omitted', async () => {
      const db = makeMockDb({ ...BASE_ROW });
      const records = createRecords(db);

      await records.overrideRecord('2024-01-15', {
        effective_steps: 8000,
        note: 'No proof',
      });

      const putArg = db.daily_records.put.mock.calls[0][0];
      expect(putArg.override.proof_image_base64).toBeNull();
    });

    it('passes through proof_image_base64 when provided', async () => {
      const db = makeMockDb({ ...BASE_ROW });
      const records = createRecords(db);
      const proof = 'data:image/jpeg;base64,xyz123';

      await records.overrideRecord('2024-01-15', {
        effective_steps: 8000,
        note: 'With proof',
        proof_image_base64: proof,
      });

      const putArg = db.daily_records.put.mock.calls[0][0];
      expect(putArg.override.proof_image_base64).toBe(proof);
    });

    it('override.updated_at is ISO string', async () => {
      const db = makeMockDb({ ...BASE_ROW });
      const records = createRecords(db);

      await records.overrideRecord('2024-01-15', {
        effective_steps: 8000,
        note: 'Test',
      });

      const putArg = db.daily_records.put.mock.calls[0][0];
      expect(() => new Date(putArg.override.updated_at)).not.toThrow();
      expect(new Date(putArg.override.updated_at).toISOString()).toBe(putArg.override.updated_at);
    });
  });


  describe('overrideRecord — zero-state (no existing row)', () => {
    it('includes `date` primary key in put payload when db.daily_records.get returns undefined', async () => {
      const db = makeMockDb(undefined); // no existing row
      const records = createRecords(db);

      await records.overrideRecord('2024-03-01', {
        effective_steps: 4200,
        note: 'Manual log — no synced baseline',
      });

      expect(db.daily_records.put).toHaveBeenCalledOnce();
      const putArg = db.daily_records.put.mock.calls[0][0];
      expect(putArg.date).toBe('2024-03-01');
      expect(putArg.effective_steps).toBe(4200);
      expect(putArg.is_overridden).toBe(true);
      // original_steps/original_distance_km stay undefined — no fake baseline
      expect(putArg.original_steps).toBeUndefined();
      expect(putArg.original_distance_km).toBeUndefined();
    });
  });

  describe('overrideRecord — guard/error paths (100% coverage)', () => {
    it('throws TypeError for negative effective_steps before DB call', async () => {
      const db = makeMockDb({ ...BASE_ROW });
      const records = createRecords(db);

      await expect(
        records.overrideRecord('2024-01-15', { effective_steps: -1, note: 'Bad' })
      ).rejects.toThrow(TypeError);
      expect(db.daily_records.put).not.toHaveBeenCalled();
    });

    it('throws TypeError for non-integer float effective_steps', async () => {
      const db = makeMockDb({ ...BASE_ROW });
      const records = createRecords(db);

      await expect(
        records.overrideRecord('2024-01-15', { effective_steps: 2.7, note: 'Bad' })
      ).rejects.toThrow(TypeError);
      expect(db.daily_records.put).not.toHaveBeenCalled();
    });

    it('throws TypeError for NaN effective_steps', async () => {
      const db = makeMockDb({ ...BASE_ROW });
      const records = createRecords(db);

      await expect(
        records.overrideRecord('2024-01-15', { effective_steps: NaN, note: 'Bad' })
      ).rejects.toThrow(TypeError);
      expect(db.daily_records.put).not.toHaveBeenCalled();
    });

    it('throws TypeError for Infinity effective_steps', async () => {
      const db = makeMockDb({ ...BASE_ROW });
      const records = createRecords(db);

      await expect(
        records.overrideRecord('2024-01-15', { effective_steps: Infinity, note: 'Bad' })
      ).rejects.toThrow(TypeError);
      expect(db.daily_records.put).not.toHaveBeenCalled();
    });

    it('throws TypeError for negative effective_distance_km', async () => {
      const db = makeMockDb({ ...BASE_ROW });
      const records = createRecords(db);

      await expect(
        records.overrideRecord('2024-01-15', {
          effective_steps: 8000,
          effective_distance_km: -0.1,
          note: 'Bad',
        })
      ).rejects.toThrow(TypeError);
      expect(db.daily_records.put).not.toHaveBeenCalled();
    });

    it('throws TypeError for empty note', async () => {
      const db = makeMockDb({ ...BASE_ROW });
      const records = createRecords(db);

      await expect(
        records.overrideRecord('2024-01-15', { effective_steps: 8000, note: '' })
      ).rejects.toThrow(TypeError);
      expect(db.daily_records.put).not.toHaveBeenCalled();
    });

    it('throws TypeError for whitespace-only note', async () => {
      const db = makeMockDb({ ...BASE_ROW });
      const records = createRecords(db);

      await expect(
        records.overrideRecord('2024-01-15', { effective_steps: 8000, note: '   ' })
      ).rejects.toThrow(TypeError);
      expect(db.daily_records.put).not.toHaveBeenCalled();
    });

    it('rejects and logs [records] when db.get rejects', async () => {
      const db = {
        daily_records: {
          get: vi.fn().mockRejectedValue(new Error('DB error')),
          put: vi.fn(),
        },
      };
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const records = createRecords(db);

      await expect(
        records.overrideRecord('2024-01-15', { effective_steps: 8000, note: 'Test' })
      ).rejects.toThrow('DB error');

      expect(consoleSpy).toHaveBeenCalledWith('[records]', expect.any(Error));
    });

    it('rejects and logs [records] when db.put rejects', async () => {
      const db = {
        daily_records: {
          get: vi.fn().mockResolvedValue({ ...BASE_ROW }),
          put: vi.fn().mockRejectedValue(new Error('DB put error')),
        },
      };
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const records = createRecords(db);

      await expect(
        records.overrideRecord('2024-01-15', { effective_steps: 8000, note: 'Test' })
      ).rejects.toThrow('DB put error');

      expect(consoleSpy).toHaveBeenCalledWith('[records]', expect.any(Error));
    });
  });

  describe('revertRecord — happy paths', () => {
    it('restores effective_steps=original_steps, effective_distance_km=original_distance_km, is_overridden=false, deletes override', async () => {
      const overriddenRow = {
        ...BASE_ROW,
        effective_steps: 8000,
        effective_distance_km: 6.1,
        is_overridden: true,
        override: { note: 'Treadmill', proof_image_base64: null, updated_at: '2024-01-15T12:00:00.000Z' },
      };
      const db = makeMockDb(overriddenRow);
      const records = createRecords(db);

      await records.revertRecord('2024-01-15');

      expect(db.daily_records.put).toHaveBeenCalledOnce();
      const putArg = db.daily_records.put.mock.calls[0][0];
      expect(putArg.effective_steps).toBe(5000);
      expect(putArg.effective_distance_km).toBe(3.81);
      expect(putArg.is_overridden).toBe(false);
      expect(putArg.override).toBeUndefined();
    });
  });

  describe('revertRecord — error paths', () => {
    it('rejects and logs [records] when db.put rejects during revert', async () => {
      const db = {
        daily_records: {
          get: vi.fn().mockResolvedValue({ ...BASE_ROW, is_overridden: true }),
          put: vi.fn().mockRejectedValue(new Error('Revert DB error')),
        },
      };
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const records = createRecords(db);

      await expect(records.revertRecord('2024-01-15')).rejects.toThrow('Revert DB error');
      expect(consoleSpy).toHaveBeenCalledWith('[records]', expect.any(Error));
    });
  });
});
