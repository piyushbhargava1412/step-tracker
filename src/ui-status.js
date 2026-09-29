/**
 * Create a status reporter for updating UI status elements.
 * This is a dependency-injection seam that allows other modules to
 * report status without directly touching the DOM.
 *
 * @param {Document} doc - The document object to use (defaults to global document)
 * @returns {Object} Object with db(text), auth(text), and sync(text) methods
 */
import { showToast } from './toast.js';
import { showSyncProgressModal, hideSyncProgressModal } from './sync-progress-modal.js';
import { levelOf, stripSymbol, renderStatusPill, STATUS_OK } from './status-light.js';

/** Prefix steps.js uses to announce the start of a multi-minute backfill (see PHASE_FULL_HISTORY). */
const FULL_HISTORY_SYNC_PREFIX = '⏳ Full history sync';

/** Auth button label while not connected, unless the platform supplies its own. */
export const DEFAULT_CONNECT_LABEL = 'Connect Google Account';

/**
 * @param {Document} [doc]
 * @param {{ connectLabel?: string }} [options]  connectLabel: the auth button's
 *   text while not connected (e.g. "Connect Health Connect" in the Android app).
 */
export function createStatusReporter(doc = document, { connectLabel = DEFAULT_CONNECT_LABEL } = {}) {
  return {
    /**
     * Show a data message — a load error, "Backup saved to …" — as a short
     * toast (ST-027: it no longer shares a pill with a status).
     * @param {string} text - The message to show
     */
    db(text) {
      showToast(doc, text);
    },

    /**
     * Update the connection pill — a green/amber/red light with "Connected"
     * or "Disconnected", the full message as its tooltip (ST-027) — and
     * mirror the state onto the auth button label (a connected session reads
     * as "Reconnect", anything else as the connect label).
     * @param {string} text - The status message, e.g. "✅ Connected"
     */
    auth(text) {
      const element = doc.getElementById('auth-status');
      if (!element) {
        console.warn('[createStatusReporter] Missing element: #auth-status');
        return;
      }
      const level = levelOf(text);
      renderStatusPill(doc, element, {
        level,
        label: level === STATUS_OK ? 'Connected' : 'Disconnected',
        detail: stripSymbol(text),
      });

      const authBtn = doc.getElementById('auth-btn');
      if (authBtn) {
        authBtn.textContent = text === '✅ Connected' ? 'Reconnect' : connectLabel;
      }
    },

    /**
     * Surface a sync-channel message.
     *
     * The multi-minute full-history-sync announcement (the `⏳ Full history
     * sync` prefix) is rendered as a dismissible modal instead of the
     * persistent status line — that text is long enough to reflow the header
     * and shift the sync/settings buttons for the whole backfill duration.
     * Terminal success messages (the `✅` prefix used by the sync engine) are
     * rendered as a transient fading toast. Every other message — progress,
     * throttling, warnings and failures — falls through to `#sync-status`,
     * and closes the modal if it was left open.
     * @param {string} text - The message to surface
     */
    sync(text) {
      const element = doc.getElementById('sync-status');
      if (!element) {
        console.warn('[createStatusReporter] Missing element: #sync-status');
        return;
      }

      if (text.startsWith(FULL_HISTORY_SYNC_PREFIX)) {
        showSyncProgressModal(doc, text);
        element.textContent = '';
        return;
      }

      hideSyncProgressModal(doc);

      if (text.startsWith('✅')) {
        // Success lives in the toast; the persistent line stays clean.
        showToast(doc, text);
        element.textContent = '';
        return;
      }

      element.textContent = text;
    }
  };
}