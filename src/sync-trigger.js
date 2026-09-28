/**
 * Sync trigger (ST-021) — the single entry point for every step sync, so the
 * app can tell how long ago it last synced.
 *
 *  - run():        user- or connection-initiated; always syncs.
 *  - runIfStale(): the app came back to the foreground; syncs only when the
 *                  source is connected and the last sync started at least
 *                  RESUME_SYNC_COOLDOWN_MS ago. Silent otherwise — a
 *                  resume must never nag an unconnected user.
 *
 * The engine's own re-entrancy guard still stops overlapping runs.
 */

/** Minimum time between automatic resume syncs. */
export const RESUME_SYNC_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * @param {object} deps
 * @param {() => Promise<void>} deps.sync     The full sync + re-render pipeline.
 * @param {() => Promise<boolean>} deps.canSync  Whether the step source is connected.
 * @param {() => number} [deps.now]
 * @param {number} [deps.cooldownMs]
 */
export function createSyncTrigger({ sync, canSync, now = Date.now, cooldownMs = RESUME_SYNC_COOLDOWN_MS }) {
  if (typeof sync !== 'function') {
    throw new TypeError('[sync-trigger] a sync function is required');
  }

  let lastStartedAt = null;

  async function run() {
    lastStartedAt = now();
    try {
      await sync();
    } catch (err) {
      console.error('[sync-trigger]', err);
    }
  }

  async function runIfStale() {
    if (lastStartedAt !== null && now() - lastStartedAt < cooldownMs) return;
    let ready = false;
    try {
      ready = (await canSync()) === true;
    } catch (err) {
      console.error('[sync-trigger] readiness check failed', err);
    }
    if (!ready) return;
    await run();
  }

  return { run, runIfStale };
}
