/**
 * Storage persistence capability, shaped like the subset of `navigator` the
 * storage modules use (`storage.persist()` / `storage.persisted()`), so they
 * keep their existing contract.
 *
 * In the browser, IndexedDB can be evicted unless the site is granted
 * persistent storage. Inside the Android app, IndexedDB lives in app-private
 * storage that is never evicted, so it is always protected.
 */

const ALWAYS_PERSISTED = Object.freeze({
  storage: Object.freeze({
    persist: async () => true,
    persisted: async () => true,
  }),
});

/**
 * @param {{ isNative: boolean, nav: Navigator|undefined }} deps
 * @returns {{ storage: { persist: () => Promise<boolean>, persisted: () => Promise<boolean> } }}
 */
export function selectStorageManager({ isNative, nav }) {
  return isNative ? ALWAYS_PERSISTED : nav;
}
