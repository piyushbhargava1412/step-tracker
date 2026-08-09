const SCOPES = 'https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.location.read';

export function createAuth(config, reporter, gsi = google) {
  let accessToken = null;
  let tokenClient = null;

  function init() {
    tokenClient = gsi.accounts.oauth2.initTokenClient({
      client_id: config.CLIENT_ID,
      scope: SCOPES,
      callback(resp) {
        if (resp?.access_token) {
          accessToken = resp.access_token;
          reporter.auth('✅ Connected');
        }
      },
    });
  }

  function requestToken() {
    tokenClient.requestAccessToken();
  }

  function getAccessToken() {
    return accessToken;
  }

  return { init, requestToken, getAccessToken };
}
