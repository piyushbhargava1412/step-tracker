import { describe, it, expect } from 'vitest';
import { selectStorageManager } from './storage-manager.js';

describe('ST-018: selectStorageManager', () => {
  it('returns the browser navigator unchanged on web', () => {
    const nav = { storage: { persist: async () => false } };
    expect(selectStorageManager({ isNative: false, nav })).toBe(nav);
  });

  it('on native, reports storage as already protected — app storage is never evicted', async () => {
    const manager = selectStorageManager({ isNative: true, nav: undefined });
    await expect(manager.storage.persist()).resolves.toBe(true);
    await expect(manager.storage.persisted()).resolves.toBe(true);
  });
});
