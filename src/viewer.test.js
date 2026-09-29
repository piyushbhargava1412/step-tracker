/**
 * src/viewer.js — the browser's read-only view of the app's Drive snapshot.
 * Runs against a real (fake-indexeddb) Dexie database with the read-only
 * backstop installed, as in the browser.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { guardWrites, isReadOnlyError } from './read-only.js';
import { createViewer, SNAPSHOT_AT_KEY, NO_BACKUP_MESSAGE, NOT_CONNECTED_MESSAGE, LOAD_FAILED_MESSAGE } from './viewer.js';

const SNAPSHOT = {
  schema_version: 1,
  exported_at: '2026-09-28T17:01:00.000Z',
  daily_records: [
    { date: '2026-09-27', effective_steps: 9000 },
    { date: '2026-09-28', effective_steps: 17498 },
  ],
  settings: [{ key: 'active_step_goal', target_steps: 6000 }],
};

let db;
let guard;
let driveSync;
let reporter;
let connected;

function makeViewer() {
  return createViewer({
    db,
    writeSnapshot: guard.writeSnapshot,
    driveSync,
    isConnected: () => connected,
    reporter,
  });
}

beforeEach(async () => {
  db = new Dexie(`viewer-test-${Math.random()}`);
  db.version(1).stores({ daily_records: 'date', settings: 'key' });
  guard = guardWrites(db, { isReadOnly: () => true });
  await db.open();
  driveSync = { pull: vi.fn().mockResolvedValue(SNAPSHOT) };
  reporter = { sync: vi.fn() };
  connected = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

describe('ST-023: viewer refresh', () => {
  it('loads the snapshot into the cache database and remembers its time', async () => {
    await expect(makeViewer().refresh()).resolves.toBe(true);
    expect(await db.daily_records.count()).toBe(2);
    expect((await db.settings.get('active_step_goal')).target_steps).toBe(6000);
    expect((await db.settings.get(SNAPSHOT_AT_KEY)).value).toBe(SNAPSHOT.exported_at);
    expect(reporter.sync).toHaveBeenCalledWith(expect.stringMatching(/^✅ /));
  });

  it('replaces the previous snapshot — days removed in the app disappear here too', async () => {
    const viewer = makeViewer();
    await viewer.refresh();
    driveSync.pull.mockResolvedValue({ ...SNAPSHOT, daily_records: [{ date: '2026-09-28', effective_steps: 20000 }], settings: [] });
    await viewer.refresh();
    expect(await db.daily_records.toArray()).toEqual([{ date: '2026-09-28', effective_steps: 20000 }]);
    expect(await db.settings.get('active_step_goal')).toBeUndefined();
  });

  it('only ever reads from Drive', async () => {
    await makeViewer().refresh();
    expect(Object.keys(driveSync)).toEqual(['pull']);
    expect(driveSync.pull).toHaveBeenCalledTimes(1);
  });

  it('with no backup on Drive, says where to make one and keeps what it showed', async () => {
    const viewer = makeViewer();
    await viewer.refresh();
    driveSync.pull.mockResolvedValue(null);
    await expect(viewer.refresh()).resolves.toBe(false);
    expect(reporter.sync).toHaveBeenLastCalledWith(NO_BACKUP_MESSAGE);
    expect(await db.daily_records.count()).toBe(2);
  });

  it('when not connected, asks to connect and does not touch Drive', async () => {
    connected = false;
    await expect(makeViewer().refresh()).resolves.toBe(false);
    expect(driveSync.pull).not.toHaveBeenCalled();
    expect(reporter.sync).toHaveBeenCalledWith(NOT_CONNECTED_MESSAGE);
  });

  it('a failed load is logged, reported, and leaves the previous data in place', async () => {
    const viewer = makeViewer();
    await viewer.refresh();
    const err = new Error('network');
    driveSync.pull.mockRejectedValue(err);
    await expect(viewer.refresh()).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith('[viewer]', err);
    expect(reporter.sync).toHaveBeenLastCalledWith(LOAD_FAILED_MESSAGE);
    expect(await db.daily_records.count()).toBe(2);
  });

  it('other writes stay blocked after a refresh', async () => {
    await makeViewer().refresh();
    await expect(db.settings.put({ key: 'active_step_goal', target_steps: 4000 })).rejects.toSatisfy(isReadOnlyError);
  });
});

describe('ST-023: viewer state', () => {
  it('canRefresh() follows the Google connection', () => {
    const viewer = makeViewer();
    expect(viewer.canRefresh()).toBe(true);
    connected = false;
    expect(viewer.canRefresh()).toBe(false);
  });

  it('snapshotTime() is null before any snapshot, then the snapshot export time', async () => {
    const viewer = makeViewer();
    await expect(viewer.snapshotTime()).resolves.toBeNull();
    await viewer.refresh();
    await expect(viewer.snapshotTime()).resolves.toBe(SNAPSHOT.exported_at);
  });

  it('snapshotTime() fails open to null', async () => {
    const viewer = createViewer({
      db: { settings: { get: vi.fn().mockRejectedValue(new Error('closed')) } },
      writeSnapshot: guard.writeSnapshot,
      driveSync,
      isConnected: () => true,
      reporter,
    });
    await expect(viewer.snapshotTime()).resolves.toBeNull();
  });
});
