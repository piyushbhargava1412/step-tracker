/**
 * Google auth selection: Google Identity Services in the browser, native
 * Google sign-in in the Android app (ST-020) — both for Drive app data only.
 * Both have the createAuth contract: init, requestToken(options),
 * getAccessToken, onTokenReceived.
 */
import { createAuth } from '../auth.js';
import { createNativeGoogleAuth } from './native/google-auth.js';
import { createDriveAuthorization } from './native/drive-authorization.js';

/**
 * @param {object} deps
 * @param {boolean} deps.isNative
 * @param {{ CLIENT_ID: string }} deps.config
 * @param {object} deps.reporter
 * @param {Storage} [deps.storage]  localStorage — the app remembers the connected
 *   Google account's email there (ST-026).
 * @param {() => Promise<object>} [deps.loadSocialLogin]  Loads the SocialLogin
 *   plugin. Loaded lazily and only in the app: the plugin's web module runs
 *   OAuth-redirect handling on import, which the browser build must not do.
 * @param {() => object} [deps.loadDriveAuthorization]  Play services Drive
 *   authorization (ST-026), app only.
 */
export function selectAuth({
  isNative,
  config,
  reporter,
  storage,
  loadSocialLogin = loadSocialLoginPlugin,
  loadDriveAuthorization = createDriveAuthorization,
}) {
  return isNative
    ? createNativeGoogleAuth({
      config,
      reporter,
      storage,
      socialLogin: loadSocialLogin(),
      driveAuthorization: loadDriveAuthorization(),
    })
    : createAuth(config, reporter);
}

function loadSocialLoginPlugin() {
  return import('@capgo/capacitor-social-login').then((module) => module.SocialLogin);
}
