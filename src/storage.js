/**
 * Request persistent storage for IndexedDB.
 * 
 * @param {Object} reporter - A reporter object with a db() method
 * @param {Object} nav - Navigator object (defaults to global navigator)
 * @returns {Promise<void>}
 */
export async function requestPersistentStorage(reporter, nav = navigator) {
  try {
    // Guard against missing nav.storage or nav.storage.persist using optional chaining
    if (!nav?.storage?.persist) {
      reporter.db('⚠️ Storage not persisted (browser may evict)');
      return;
    }

    const ok = await nav.storage.persist();
    
    if (ok) {
      reporter.db('💾 Persistent storage granted');
    } else {
      reporter.db('⚠️ Storage not persisted (browser may evict)');
    }
  } catch (err) {
    console.error('[requestPersistentStorage] persist() failed', err);
    reporter.db('⚠️ Storage not persisted (browser may evict)');
  }
}
