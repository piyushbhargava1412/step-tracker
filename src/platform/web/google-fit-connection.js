/**
 * Google Fit connection (web): what the header Connect button does in the
 * browser, and how a refreshed page reconnects without UI.
 *
 * @typedef {object} Connection
 * @property {string} label                 Connect button text while not connected.
 * @property {() => void|Promise<void>} connect   User-initiated connect.
 * @property {() => void|Promise<void>} restore   Silent reconnect at startup.
 * @property {(listener: () => Promise<void>|void) => void} onConnected
 *           Run `listener` (the sync pipeline) every time a connection succeeds.
 */

/** Connect button text in the browser. */
export const GOOGLE_CONNECT_LABEL = 'Connect Google Account';

/**
 * localStorage key recording that the user has connected their Google
 * account. Only a boolean flag is stored — never the access token itself. On
 * a later page load it triggers a silent session restore (GSI `prompt: ''`),
 * so a refresh does not force a reconnect.
 */
export const GOOGLE_CONNECTED_KEY = 'google_connected';

/**
 * @param {{ auth: object, storage: Storage|undefined }} deps
 * @returns {Connection}
 */
export function createGoogleFitConnection({ auth, storage }) {
  return {
    label: GOOGLE_CONNECT_LABEL,

    connect() {
      auth.requestToken();
    },

    restore() {
      try {
        if (storage?.getItem(GOOGLE_CONNECTED_KEY) === '1') {
          auth.requestToken({ prompt: '' });
        }
      } catch (err) {
        console.error('[google-fit-connection] failed to read the connection flag, continuing', err);
      }
    },

    onConnected(listener) {
      auth.onTokenReceived(async () => {
        try {
          storage?.setItem(GOOGLE_CONNECTED_KEY, '1');
        } catch (err) {
          console.error('[google-fit-connection] failed to persist the connection flag, continuing', err);
        }
        await listener();
      });
    },
  };
}
