/**
 * Google account connection — shared by the browser viewer's Connect button
 * and the Android app's Drive panel (both Drive only). Works with any
 * auth object that has the createAuth contract: requestToken(options),
 * getAccessToken(), onTokenReceived(listener).
 *
 * @typedef {object} Connection
 * @property {string} label                 Connect button text while not connected.
 * @property {() => boolean} [isConnected]  Whether a connection is active now.
 * @property {() => void|Promise<void>} connect   User-initiated connect.
 * @property {() => void|Promise<void>} restore   Silent reconnect at startup.
 * @property {(listener: () => Promise<void>|void) => void} onConnected
 *           Run `listener` every time a connection succeeds.
 */

/**
 * @param {object} deps
 * @param {object} deps.auth      createAuth-shaped Google auth.
 * @param {Storage} [deps.storage] localStorage, for the "connected before" flag.
 * @param {string} deps.label     Connect button text.
 * @param {string} deps.flagKey   localStorage key of the flag. Only a boolean is
 *   stored — never the token. It triggers a silent restore (`prompt: ''`) at
 *   the next startup, so reopening the app does not force a reconnect.
 * @returns {Connection}
 */
export function createGoogleConnection({ auth, storage, label, flagKey }) {
  return {
    label,

    isConnected() {
      return Boolean(auth.getAccessToken?.());
    },

    connect() {
      auth.requestToken();
    },

    restore() {
      try {
        if (storage?.getItem(flagKey) === '1') {
          auth.requestToken({ prompt: '' });
        }
      } catch (err) {
        console.error('[google-connection] failed to read the connection flag, continuing', err);
      }
    },

    onConnected(listener) {
      auth.onTokenReceived(async () => {
        try {
          storage?.setItem(flagKey, '1');
        } catch (err) {
          console.error('[google-connection] failed to persist the connection flag, continuing', err);
        }
        await listener();
      });
    },
  };
}
