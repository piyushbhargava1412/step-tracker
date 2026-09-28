/**
 * Google Drive connection in the Android app (ST-020). The header button is
 * Health Connect's, so Google sign-in for Drive lives in the Drive panel; it
 * restores silently at launch once the user has connected before.
 */
import { createGoogleConnection } from '../google-connection.js';

export const GOOGLE_DRIVE_CONNECT_LABEL = 'Connect Google Drive';

/** localStorage flag: the user connected Google Drive in this app before. */
export const GOOGLE_DRIVE_CONNECTED_KEY = 'google_drive_connected';

/**
 * @param {{ auth: object, storage: Storage|undefined }} deps
 * @returns {import('../google-connection.js').Connection}
 */
export function createGoogleDriveConnection({ auth, storage }) {
  return createGoogleConnection({
    auth,
    storage,
    label: GOOGLE_DRIVE_CONNECT_LABEL,
    flagKey: GOOGLE_DRIVE_CONNECTED_KEY,
  });
}
