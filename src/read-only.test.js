/**
 * src/read-only.js against a real IndexedDB (fake-indexeddb) and real Dexie —
 * the backstop has to hold for every kind of write Dexie can issue.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { guardWrites, ReadOnlyError, isReadOnlyError } from './read-only.js';

let db;
let readOnly;
let guard;

beforeEach(async () => {
  db = new Dexie(`read-only-test-${Math.random()}`);
  db.version(1).stores({ daily_records: 'date', settings: 'key' });
  readOnly = true;
  guard = guardWrites(db, { isReadOnly: () => readOnly });
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe('guardWrites — read-only role', () => {
  it.each([
    ['put', () => db.settings.put({ key: 'a', value: 1 })],
    ['add', () => db.settings.add({ key: 'a', value: 1 })],
    ['bulkPut', () => db.daily_records.bulkPut([{ date: '2026-01-01' }])],
    ['delete', () => db.settings.delete('a')],
    ['clear', () => db.daily_records.clear()],
    ['where().delete()', () => db.daily_records.where('date').below('2026-01-01').delete()],
    ['update', () => db.settings.update('a', { value: 2 })],
    ['collection modify', () => db.daily_records.toCollection().modify({ x: 1 })],
  ])('rejects %s with ReadOnlyError', async (_name, write) => {
    await expect(write()).rejects.toSatisfy(isReadOnlyError);
  });

  it('a rejected write changes nothing', async () => {
    await expect(db.settings.put({ key: 'a', value: 1 })).rejects.toSatisfy(isReadOnlyError);
    expect(await db.settings.count()).toBe(0);
  });

  it('reads still work', async () => {
    await expect(db.daily_records.toArray()).resolves.toEqual([]);
    await expect(db.settings.get('a')).resolves.toBeUndefined();
  });

  it('the error explains itself', () => {
    const err = new ReadOnlyError();
    expect(err.name).toBe('ReadOnlyError');
    expect(err.message).toMatch(/view only/i);
  });

  it('isReadOnlyError recognises it directly and as Dexie rethrows it (same name, DexieError class)', async () => {
    expect(isReadOnlyError(new ReadOnlyError())).toBe(true);
    const rethrown = await db.settings.put({ key: 'a' }).catch((e) => e);
    expect(rethrown).not.toBeInstanceOf(ReadOnlyError);
    expect(isReadOnlyError(rethrown)).toBe(true);
    expect(isReadOnlyError(new Error('x'))).toBe(false);
    expect(isReadOnlyError(null)).toBe(false);
  });
});

describe('guardWrites — writeSnapshot', () => {
  it('lets the snapshot replacement write, atomically, across tables', async () => {
    await guard.writeSnapshot(async () => {
      await db.daily_records.clear();
      await db.daily_records.bulkPut([{ date: '2026-01-01' }, { date: '2026-01-02' }]);
      await db.settings.put({ key: 'viewer_snapshot_at', value: 'x' });
    });
    expect(await db.daily_records.count()).toBe(2);
    expect((await db.settings.get('viewer_snapshot_at')).value).toBe('x');
  });

  it('rolls the whole snapshot back when it fails midway', async () => {
    await guard.writeSnapshot(() => db.daily_records.bulkPut([{ date: '2026-01-01' }]));
    await expect(guard.writeSnapshot(async () => {
      await db.daily_records.clear();
      throw new Error('bad snapshot');
    })).rejects.toThrow('bad snapshot');
    expect(await db.daily_records.count()).toBe(1);
  });

  it('does not open the door for other writes', async () => {
    await guard.writeSnapshot(() => db.settings.put({ key: 'a', value: 1 }));
    await expect(db.settings.put({ key: 'b', value: 1 })).rejects.toSatisfy(isReadOnlyError);
  });
});

describe('guardWrites — editor role', () => {
  it('lets every write through', async () => {
    readOnly = false;
    await db.settings.put({ key: 'a', value: 1 });
    await db.daily_records.bulkPut([{ date: '2026-01-01' }]);
    await db.daily_records.clear();
    expect(await db.settings.count()).toBe(1);
  });
});
