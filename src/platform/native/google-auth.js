/**
 * Native Google auth for the Android app (ST-020, ST-026) — Drive only.
 *
 * Google blocks its web sign-in inside an app's WebView, so the first connect
 * signs in through Android's Credential Manager via
 * @capgo/capacitor-social-login (account picker + Drive consent). From then on
 * every token comes from Google Play services' Authorization API (the
 * app-local DriveAuthorization plugin): a token for the already-granted
 * scope, with no sign-in and no UI, renewed by Play services when it expires.
 * That is what keeps the user connected — the plugin's own `refresh()` would
 * run a new Credential Manager sign-in ("Signing in as…") once a token expires.
 *
 * The returned object has the same contract as the web createAuth()
 * (init, requestToken(options), getAccessToken, onTokenReceived), plus
 * getFreshAccessToken() for the Drive gateway, so drive-sync.js and the
 * connection wiring don't know which one they use.
 *
 * Deliberate differences from web:
 * - Only drive.appdata is requested: steps come from Health Connect.
 * - The header status line belongs to Health Connect, so this never writes
 *   reporter.auth(); the Drive panel shows the Google connection instead.
 * - A silent request (`prompt: ''`) never shows UI; an interactive one shows
 *   the account picker / consent only when the silent authorization has no token.
 */

export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SCOPES = [DRIVE_APPDATA_SCOPE];
const PROVIDER = 'google';

/** localStorage: the email of the Google account connected for Drive (never a token). */
export const GOOGLE_DRIVE_ACCOUNT_KEY = 'google_drive_account';

/**
 * @param {object} deps
 * @param {{ CLIENT_ID: string }} deps.config  The *web* OAuth client id — Credential
 *   Manager uses it as the token audience. The Android OAuth client only has to
 *   exist in the same Google Cloud project (package name + signing SHA-1).
 * @param {object} deps.reporter     Status reporter (sync(text)).
 * @param {object|Promise<object>} deps.socialLogin  The SocialLogin plugin (or a
 *   promise of it, when it is loaded lazily).
 * @param {{ authorize: (options: object) => Promise<string|null> }} deps.driveAuthorization
 *   Play services authorization (src/platform/native/drive-authorization.js).
 * @param {Storage} [deps.storage]  localStorage, for the connected account's email.
 */
export function createNativeGoogleAuth({ config, reporter, socialLogin, driveAuthorization, storage }) {
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

  function _readAccount() {
    try {
      return storage?.getItem(GOOGLE_DRIVE_ACCOUNT_KEY) || null;
    } catch (err) {
      console.error('[native-google-auth] failed to read the connected account', err);
      return null;
    }
  }

  function _rememberAccount(email) {
    if (!email) return;
    try {
      storage?.setItem(GOOGLE_DRIVE_ACCOUNT_KEY, email);
    } catch (err) {
      console.error('[native-google-auth] failed to remember the connected account', err);
    }
  }

  /** A token for the granted scope without any UI, or null. */
  function silentToken() {
    const account = _readAccount();
    return driveAuthorization.authorize(account ? { scopes: SCOPES, account } : { scopes: SCOPES });
  }

  async function interactiveToken() {
    const google = await ensureInitialized();
    const { result } = await google.login({ provider: PROVIDER, options: { scopes: SCOPES } });
    _rememberAccount(result?.profile?.email);
    return result?.accessToken?.token ?? null;
  }

  /**
   * @param {{ prompt?: string }} [options]  `prompt: ''` = silent (never shows UI).
   */
  function requestToken(options) {
    const silent = options?.prompt === '';
    const obtain = async () => (await silentToken()) ?? (silent ? null : interactiveToken());

    obtain().then(
      (token) => {
        if (!token) {
          if (silent) return;
          throw new Error('no access token');
        }
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

  /**
   * A current token for a Drive request: Play services hands back its cached
   * token while valid and renews it when expired. Falls back to the last token;
   * null before the user ever connected.
   * @returns {Promise<string|null>}
   */
  async function getFreshAccessToken() {
    if (!accessToken && !_readAccount()) return null;
    const token = await silentToken();
    if (token) accessToken = token;
    return accessToken;
  }

  function onTokenReceived(listener) {
    onTokenListener = listener;
  }

  async function signOut() {
    accessToken = null;
    try {
      storage?.removeItem(GOOGLE_DRIVE_ACCOUNT_KEY);
    } catch (err) {
      console.error('[native-google-auth] failed to forget the connected account', err);
    }
    try {
      const google = await ensureInitialized();
      await google.logout({ provider: PROVIDER });
    } catch (err) {
      console.error('[native-google-auth] sign-out failed', err);
    }
  }

  return { init, requestToken, getAccessToken, getFreshAccessToken, onTokenReceived, signOut };
}
