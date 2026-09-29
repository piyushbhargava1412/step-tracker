/**
 * Google account connection (web): what Connect does in the browser — Google
 * sign-in for Drive, which the read-only viewer (ST-023) reads the app's backup
 * from — and how a refreshed page reconnects without UI.
 */
import { createGoogleConnection } from '../google-connection.js';

/** Connect button text in the browser. */
export const GOOGLE_CONNECT_LABEL = 'Connect Google Account';

/** localStorage flag recording that the user connected Google in this browser. */
export const GOOGLE_CONNECTED_KEY = 'google_connected';

/**
 * @param {{ auth: object, storage: Storage|undefined }} deps
 * @returns {import('../google-connection.js').Connection}
 */
export function createGoogleAccountConnection({ auth, storage }) {
  return createGoogleConnection({ auth, storage, label: GOOGLE_CONNECT_LABEL, flagKey: GOOGLE_CONNECTED_KEY });
}
