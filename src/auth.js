const SCOPES = 'https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.location.read https://www.googleapis.com/auth/drive.appdata';

export function createAuth(config, reporter, gsi) {
  let accessToken = null;
  let tokenClient = null;
  let onTokenListener = null;

  /**
   * Resolved lazily inside init() rather than as a `= google` default
   * parameter: the GSI `<script>` tag loads asynchronously, so the global
   * may not exist yet at the moment createAuth() itself is called (e.g. a
   * cold/incognito load can race bootstrap()). A default parameter would
   * evaluate that bare reference eagerly and throw synchronously.
   */
  function init() {
    const client = gsi ?? window.google;
    if (!client?.accounts?.oauth2) {
      console.error('[auth] Google Identity Services unavailable — init() aborted');
      return;
    }

    tokenClient = client.accounts.oauth2.initTokenClient({
      client_id: config.CLIENT_ID,
      scope: SCOPES,
      callback(resp) {
        if (resp?.access_token) {
          accessToken = resp.access_token;
          reporter.auth('✅ Connected');
          if (onTokenListener) onTokenListener(resp.access_token);
        } else {
          accessToken = null;
        }
      },
    });
  }

  /**
   * Request an access token.
   *
   * With no argument, `tokenClient.requestAccessToken()` runs Google's
   * interactive consent flow. With `{ prompt: '' }` it asks GSI to silently
   * return a fresh token using the user's existing Google session (used to
   * restore the connection after a page refresh without any UI).
   *
   * @param {{ prompt?: string }} [options]  OverridableTokenClientConfig subset.
   */
  function requestToken(options) {
    if (!tokenClient) {
      console.error('[auth] requestToken() called before init()');
      return;
    }
    if (options) {
      tokenClient.requestAccessToken(options);
    } else {
      tokenClient.requestAccessToken();
    }
  }

  function getAccessToken() {
    return accessToken;
  }

  /**
   * Register a listener invoked with the access token every time a valid
   * token arrives — from the interactive connect flow or a silent restore.
   * Lets the composition root run a sync the moment the user is connected.
   *
   * @param {(token: string) => void} listener
   */
  function onTokenReceived(listener) {
    onTokenListener = listener;
  }

  return { init, requestToken, getAccessToken, onTokenReceived };
}
