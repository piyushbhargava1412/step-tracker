/**
 * Create a status reporter for updating UI status elements.
 * This is a dependency-injection seam that allows other modules to
 * report status without directly touching the DOM.
 *
 * @param {Document} doc - The document object to use (defaults to global document)
 * @returns {Object} Object with db(text), auth(text), and sync(text) methods
 */
import { showToast } from './toast.js';

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
     * Terminal success messages (the `✅` prefix used by the sync engine) are
     * rendered as a transient fading toast instead of being pasted into the
     * persistent status line. Every other message — progress, throttling,
     * warnings and failures — falls through to `#sync-status`.
     * @param {string} text - The message to surface
     */
    sync(text) {
      const element = doc.getElementById('sync-status');
      if (!element) {
        console.warn('[createStatusReporter] Missing element: #sync-status');
        return;
      }

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