/**
 * Step data source selection — the one place that decides where steps come
 * from on each platform, and what the header Connect button does:
 *
 *   browser      → Google Fit REST  + Google sign-in
 *   Android app  → Health Connect   + Health Connect permissions
 */
import { createFitStepSource } from '../fit-step-source.js';
import { createHealthConnectStepSource } from '../health-connect-step-source.js';
import { createGoogleFitConnection, GOOGLE_CONNECT_LABEL } from './web/google-fit-connection.js';
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
 * @returns {{ source: import('../step-source.js').StepSource,
 *             connection: import('./web/google-fit-connection.js').Connection }}
 */
export function selectStepSource({ isNative, auth, reporter, storage, health, launcher }) {
  if (isNative) {
    return {
      source: createHealthConnectStepSource(health, reporter),
      connection: createHealthConnectConnection({ health, reporter, launcher }),
    };
  }
  return {
    source: createFitStepSource(auth, reporter),
    connection: createGoogleFitConnection({ auth, storage }),
  };
}
