/**
 * Step data source selection — the one place that decides where steps come
 * from on each platform, and what the Connect button does:
 *
 *   Android app  → Health Connect + Health Connect permissions
 *   browser      → no step source (ST-024: Google Fit is gone) + Google sign-in,
 *                  which the read-only viewer uses to read the app's Drive backup
 */
import { createHealthConnectStepSource } from '../health-connect-step-source.js';
import { createGoogleAccountConnection, GOOGLE_CONNECT_LABEL } from './web/google-account-connection.js';
import {
  createHealthConnectConnection,
  HEALTH_CONNECT_CONNECT_LABEL,
} from './native/health-connect-connection.js';

/**
 * Connect button text for a platform — needed before the connection exists,
 * because the status reporter (which the connection reports through) is
 * created first.
 *
 * @param {boolean} isNative
 * @returns {string}
 */
export function connectLabelFor(isNative) {
  return isNative ? HEALTH_CONNECT_CONNECT_LABEL : GOOGLE_CONNECT_LABEL;
}

/**
 * @param {object} deps
 * @param {boolean} deps.isNative
 * @param {object}  deps.auth      Google auth (web).
 * @param {object}  deps.reporter  Status reporter.
 * @param {Storage} [deps.storage] localStorage (web connection flag).
 * @param {object}  [deps.health]  @capgo/capacitor-health plugin (native).
 * @param {object}  [deps.launcher] @capacitor/app-launcher (native).
 * @returns {{ source: import('../step-source.js').StepSource|null,
 *             connection: import('../google-connection.js').Connection }}
 */
export function selectStepSource({ isNative, auth, reporter, storage, health, launcher }) {
  if (isNative) {
    return {
      source: createHealthConnectStepSource(health, reporter),
      connection: createHealthConnectConnection({ health, reporter, launcher }),
    };
  }
  return {
    source: null,
    connection: createGoogleAccountConnection({ auth, storage }),
  };
}
