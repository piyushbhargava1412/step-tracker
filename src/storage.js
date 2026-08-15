/**
 * Compact header-badge copy for the #db-status persistence pill. Kept here
 * (the non-DOM capability module) as the single source of truth; PERSISTED_TEXT
 * is reused by src/storage-health.js's drive-aware badge computation.
 */
export const NOT_PERSISTED_TEXT = '⚠️ Unprotected';
export const PERSISTED_TEXT = '🛡️ Storage Safe';

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
      reporter.db(NOT_PERSISTED_TEXT);
      return;
    }

    const ok = await nav.storage.persist();

    if (ok) {
      reporter.db(PERSISTED_TEXT);
    } else {
      reporter.db(NOT_PERSISTED_TEXT);
    }
  } catch (err) {
    console.error('[requestPersistentStorage] persist() failed', err);
    reporter.db(NOT_PERSISTED_TEXT);
  }
}
