/**
 * Google auth selection: Google Identity Services in the browser (Fit + Drive
 * scopes), native Google sign-in in the Android app (Drive only — ST-020).
 * Both have the createAuth contract: init, requestToken(options),
 * getAccessToken, onTokenReceived.
 */
import { createAuth } from '../auth.js';
import { createNativeGoogleAuth } from './native/google-auth.js';

/**
 * @param {object} deps
 * @param {boolean} deps.isNative
 * @param {{ CLIENT_ID: string }} deps.config
 * @param {object} deps.reporter
 * @param {() => Promise<object>} [deps.loadSocialLogin]  Loads the SocialLogin
 *   plugin. Loaded lazily and only in the app: the plugin's web module runs
 *   OAuth-redirect handling on import, which the browser build must not do.
 */
export function selectAuth({ isNative, config, reporter, loadSocialLogin = loadSocialLoginPlugin }) {
  return isNative
    ? createNativeGoogleAuth({ config, reporter, socialLogin: loadSocialLogin() })
    : createAuth(config, reporter);
}

function loadSocialLoginPlugin() {
  return import('@capgo/capacitor-social-login').then((module) => module.SocialLogin);
}
