/**
 * Challenge engine.
 * Manages the active group challenge stored in the Dexie `settings` store under
 * the key `'active_challenge'`.
 *
 * Pure engine — no DOM imports. All DOM work belongs in `challenge-ui.js`.
 * Follows the factory-with-DI pattern from `goal.js`.
 */

export const ACTIVE_CHALLENGE_KEY = 'active_challenge';

/**
 * Returns true when a stored row has the minimum required fields for a valid
 * active challenge: `start_date` and `end_date` must both be strings.
 * @param {*} row
 * @returns {boolean}
 */
function _isValidChallengeRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (typeof row.start_date !== 'string') return false;
  if (typeof row.end_date !== 'string') return false;
  return true;
}

/**
 * Factory: Challenge engine.
 *
 * @param {{ settings: { get: Function, put: Function } }} db - injected Dexie db handle
 * @returns {{ getActiveChallenge: Function, setActiveChallenge: Function }}
 */
export function createChallenge(db) {
  /**
   * Reads the active challenge from the `settings` store.
   * Returns the stored row when it is a valid challenge object; returns `null`
   * for absent or corrupt rows. Read errors are logged and swallowed — never
   * throws.
   *
   * @returns {Promise<object|null>}
   */
  async function getActiveChallenge() {
    let row;
    try {
      row = await db.settings.get(ACTIVE_CHALLENGE_KEY);
    } catch (err) {
      console.error('[challenge]', err);
      return null;
    }

    return _isValidChallengeRow(row) ? row : null;
  }

  /**
   * Persists a new or updated active challenge.
   *
   * Guard clause: throws `RangeError` when `end_date < start_date`.
   * Preserves the existing `created_at` on edit; sets a fresh ISO timestamp on
   * first save. DB write errors are logged and swallowed (fail-open) — the
   * `RangeError` guard still propagates.
   *
   * @param {{ name?: string|null, start_date: string, end_date: string }} options
   * @returns {Promise<void>}
   */
  async function setActiveChallenge({ name, start_date, end_date } = {}) {
    if (end_date < start_date) {
      throw new RangeError(
        `setActiveChallenge: end_date (${end_date}) must not be before start_date (${start_date})`
      );
    }

    // Preserve created_at from an existing row; set a new one on first save.
    let created_at;
    try {
      const existing = await db.settings.get(ACTIVE_CHALLENGE_KEY);
      created_at =
        existing && typeof existing.created_at === 'string'
          ? existing.created_at
          : new Date().toISOString();
    } catch {
      created_at = new Date().toISOString();
    }

    try {
      await db.settings.put({
        key: ACTIVE_CHALLENGE_KEY,
        name: name ?? null,
        start_date,
        end_date,
        created_at,
      });
    } catch (err) {
      console.error('[challenge]', err);
    }
  }

  return { getActiveChallenge, setActiveChallenge };
}
