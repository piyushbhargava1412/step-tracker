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

/** Prefix steps.js uses to announce the start of a multi-minute backfill (see PHASE_FULL_HISTORY). */
const FULL_HISTORY_SYNC_PREFIX = '⏳ Full history sync';

export function createStatusReporter(doc = document) {
  return {
    /**
     * Update the database status element.
     * @param {string} text - The text to display
     */
    db(text) {
      const element = doc.getElementById('db-status');
      if (!element) {
        console.warn('[createStatusReporter] Missing element: #db-status');
        return;
      }
      element.textContent = text;
    },

    /**
     * Update the authentication status element and mirror the state onto the
     * auth button label (a connected session reads as "Reconnect", anything
     * else as "Connect Google Account").
     * @param {string} text - The text to display
     */
    auth(text) {
      const element = doc.getElementById('auth-status');
      if (!element) {
        console.warn('[createStatusReporter] Missing element: #auth-status');
        return;
      }
      element.textContent = text;

      const authBtn = doc.getElementById('auth-btn');
      if (authBtn) {
        authBtn.textContent = text === '✅ Connected' ? 'Reconnect' : 'Connect Google Account';
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