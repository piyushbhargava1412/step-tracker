import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSyncTrigger, RESUME_SYNC_COOLDOWN_MS } from './sync-trigger.js';

describe('ST-021: createSyncTrigger', () => {
  let clock;
  let sync;
  let canSync;

  beforeEach(() => {
    clock = 1_000_000;
    sync = vi.fn().mockResolvedValue(undefined);
    canSync = vi.fn().mockResolvedValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  const make = () => createSyncTrigger({ sync, canSync, now: () => clock });

  it('waits ten minutes between resume syncs', () => {
    expect(RESUME_SYNC_COOLDOWN_MS).toBe(10 * 60 * 1000);
  });

  it('run() always syncs, whatever the time since the last one', async () => {
    const trigger = make();
    await trigger.run();
    await trigger.run();
    expect(sync).toHaveBeenCalledTimes(2);
    expect(canSync).not.toHaveBeenCalled();
  });

  it('runIfStale() syncs when nothing has synced yet in this session', async () => {
    await make().runIfStale();
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('runIfStale() skips within the cooldown after any sync, and syncs once it has passed', async () => {
    const trigger = make();
    await trigger.run();

    clock += RESUME_SYNC_COOLDOWN_MS - 1;
    await trigger.runIfStale();
    expect(sync).toHaveBeenCalledTimes(1);

    clock += 1;
    await trigger.runIfStale();
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('the cooldown counts from when a sync started, so a failing sync is not retried on every resume', async () => {
    sync.mockRejectedValueOnce(new Error('offline'));
    const trigger = make();
    await trigger.run();
    await trigger.runIfStale();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('[sync-trigger]', expect.any(Error));
  });

  it('runIfStale() stays silent when the step source is not connected', async () => {
    canSync.mockResolvedValue(false);
    await make().runIfStale();
    expect(sync).not.toHaveBeenCalled();
  });

  it('runIfStale() does not start the cooldown when it skipped for lack of a connection', async () => {
    canSync.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const trigger = make();
    await trigger.runIfStale();
    await trigger.runIfStale();
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('runIfStale() treats a failing readiness check as not connected', async () => {
    canSync.mockRejectedValue(new Error('boom'));
    await expect(make().runIfStale()).resolves.toBeUndefined();
    expect(sync).not.toHaveBeenCalled();
  });

  it('fails fast without a sync function', () => {
    expect(() => createSyncTrigger({ sync: null, canSync })).toThrow(TypeError);
  });
});
