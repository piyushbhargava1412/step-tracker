/**
 * Native Google sign-in for the Android app (ST-020) — Drive only.
 *
 * Google blocks its web sign-in inside an app's WebView, so the app signs in
 * through Android's Credential Manager via @capgo/capacitor-social-login. The
 * returned object has the same contract as the web createAuth()
 * (init, requestToken(options), getAccessToken, onTokenReceived), so
 * drive-sync.js and the connection wiring don't know which one they use.
 *
 * Deliberate differences from web:
 * - Only drive.appdata is requested: steps come from Health Connect.
 * - The header status line belongs to Health Connect, so this never writes
 *   reporter.auth(); the Drive panel shows the Google connection instead.
 * - A silent request (`prompt: ''`) refreshes through Credential Manager's
 *   saved account and never shows UI; an interactive one may show the
 *   account picker / consent.
 */

export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

const SCOPES = [DRIVE_APPDATA_SCOPE];
const PROVIDER = 'google';

/**
 * @param {object} deps
 * @param {{ CLIENT_ID: string }} deps.config  The *web* OAuth client id — Credential
 *   Manager uses it as the token audience. The Android OAuth client only has to
 *   exist in the same Google Cloud project (package name + signing SHA-1).
 * @param {object} deps.reporter     Status reporter (sync(text)).
 * @param {object|Promise<object>} deps.socialLogin  The SocialLogin plugin (or a
 *   promise of it, when it is loaded lazily).
 */
export function createNativeGoogleAuth({ config, reporter, socialLogin }) {
  let accessToken = null;
  let onTokenListener = null;
  let initialization = null;

  /** Resolve the plugin and initialise Google sign-in once; returns the plugin. */
  function ensureInitialized() {
    initialization ??= Promise.resolve(socialLogin).then(async (loaded) => {
      await loaded.initialize({ google: { webClientId: config.CLIENT_ID, mode: 'online' } });
      return loaded;
    });
    return initialization;
  }

  function init() {
    ensureInitialized().catch((err) => console.error('[native-google-auth] init failed', err));
  }

  /** A token for the saved account without any UI, or null. */
  async function silentToken() {
    const google = await ensureInitialized();
    // No-op while the saved token is valid; otherwise re-selects the saved account.
    await google.refresh({ provider: PROVIDER, options: { scopes: SCOPES } });
    const { accessToken: token } = await google.getAuthorizationCode({ provider: PROVIDER });
    return token ?? null;
  }

  async function interactiveToken() {
    const google = await ensureInitialized();
    const { result } = await google.login({ provider: PROVIDER, options: { scopes: SCOPES } });
    return result?.accessToken?.token ?? null;
  }

  /**
   * @param {{ prompt?: string }} [options]  `prompt: ''` = silent (never shows UI).
   */
  function requestToken(options) {
    const silent = options?.prompt === '';

    const obtain = async () => {
      try {
        const token = await silentToken();
        if (token || silent) return token;
      } catch (err) {
        if (silent) throw err;
      }
      return interactiveToken();
    };

    obtain().then(
      (token) => {
        if (!token) throw new Error('no access token');
        accessToken = token;
        onTokenListener?.(token);
      },
    ).catch((err) => {
      console.error('[native-google-auth]', err);
      if (!silent) {
        reporter.sync("❌ Google sign-in didn't complete — check your connection and try again");
      }
    });
  }

  function getAccessToken() {
    return accessToken;
  }

  function onTokenReceived(listener) {
    onTokenListener = listener;
  }

  async function signOut() {
    accessToken = null;
    try {
      const google = await ensureInitialized();
      await google.logout({ provider: PROVIDER });
    } catch (err) {
      console.error('[native-google-auth] sign-out failed', err);
    }
  }

  return { init, requestToken, getAccessToken, onTokenReceived, signOut };
}
