import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestPersistentStorage } from './storage.js';

function makeReporter() {
  return { db: vi.fn(), auth: vi.fn() };
}

function makeNav({ persist = null } = {}) {
  if (persist === null) {
    return { storage: undefined };
  }
  return {
    storage: {
      persist: vi.fn(persist),
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('requestPersistentStorage', () => {
  it('persist() resolving true reports the granted message', async () => {
    const nav = makeNav({ persist: () => Promise.resolve(true) });
    const reporter = makeReporter();
    
    await requestPersistentStorage(reporter, nav);
    
    expect(reporter.db).toHaveBeenCalledWith('💾 Persistent storage granted');
  });

  it('persist() resolving false reports the eviction-warning message', async () => {
    const nav = makeNav({ persist: () => Promise.resolve(false) });
    const reporter = makeReporter();
    
    await requestPersistentStorage(reporter, nav);
    
    expect(reporter.db).toHaveBeenCalledWith('⚠️ Storage not persisted (browser may evict)');
  });

  it('persist() rejecting logs console.error and reports the warning; does not throw', async () => {
    const err = new Error('persist() failed');
    const nav = makeNav({ persist: () => Promise.reject(err) });
    const reporter = makeReporter();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      requestPersistentStorage(reporter, nav)
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith('[requestPersistentStorage] persist() failed', err);
    expect(reporter.db).toHaveBeenCalledWith('⚠️ Storage not persisted (browser may evict)');
    consoleSpy.mockRestore();
  });

  it('when nav.storage is unavailable, reports warning gracefully', async () => {
    const nav = { storage: undefined };
    const reporter = makeReporter();
    
    await requestPersistentStorage(reporter, nav);
    
    expect(reporter.db).toHaveBeenCalledWith('⚠️ Storage not persisted (browser may evict)');
  });

  it('when nav.storage.persist is unavailable, reports warning gracefully', async () => {
    const nav = { storage: {} };
    const reporter = makeReporter();
    
    await requestPersistentStorage(reporter, nav);
    
    expect(reporter.db).toHaveBeenCalledWith('⚠️ Storage not persisted (browser may evict)');
  });

  it('defaults to navigator when nav parameter is omitted', async () => {
    const reporter = makeReporter();
    
    // Call without nav parameter - should default to navigator (which likely doesn't have storage in test env)
    await requestPersistentStorage(reporter);
    
    // Should report the warning since navigator.storage.persist is unavailable
    expect(reporter.db).toHaveBeenCalledWith('⚠️ Storage not persisted (browser may evict)');
  });

  it('calls persist() only once', async () => {
    const nav = makeNav({ persist: () => Promise.resolve(true) });
    const reporter = makeReporter();
    
    await requestPersistentStorage(reporter, nav);
    
    expect(nav.storage.persist).toHaveBeenCalledTimes(1);
  });
});
