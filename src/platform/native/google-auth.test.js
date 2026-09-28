import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createNativeGoogleAuth, DRIVE_APPDATA_SCOPE } from './google-auth.js';

describe('ST-020: native Google sign-in (Drive only)', () => {
  let socialLogin;
  let reporter;
  const config = { CLIENT_ID: 'web-id' };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => {
    socialLogin = {
      initialize: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      getAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: 'tok-sil' }),
      login: vi.fn().mockResolvedValue({ provider: 'google', result: { responseType: 'online', accessToken: { token: 'tok-new' }, idToken: null } }),
      logout: vi.fn().mockResolvedValue(undefined),
    };
    reporter = { sync: vi.fn(), auth: vi.fn() };
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  const make = () => createNativeGoogleAuth({ config, reporter, socialLogin });

  it('asks only for Drive app-data access', () => {
    expect(DRIVE_APPDATA_SCOPE).toBe('https://www.googleapis.com/auth/drive.appdata');
  });

  it('init() sets up Google sign-in with the web client id as the token audience', async () => {
    make().init();
    await flush();
    expect(socialLogin.initialize).toHaveBeenCalledWith({
      google: { webClientId: config.CLIENT_ID, mode: 'online' },
    });
  });

  it('init() failure is logged, not thrown', async () => {
    socialLogin.initialize.mockRejectedValue(new Error('no play services'));
    expect(() => make().init()).not.toThrow();
    await flush();
    expect(console.error).toHaveBeenCalled();
  });

  it('a silent request reuses the saved account without UI and notifies listeners', async () => {
    const auth = make();
    const listener = vi.fn();
    auth.onTokenReceived(listener);

    auth.requestToken({ prompt: '' });
    await flush();

    expect(socialLogin.refresh).toHaveBeenCalledWith({ provider: 'google', options: { scopes: [DRIVE_APPDATA_SCOPE] } });
    expect(socialLogin.login).not.toHaveBeenCalled();
    expect(auth.getAccessToken()).toBe('tok-sil');
    expect(listener).toHaveBeenCalledWith('tok-sil');
  });

  it('a failed silent request stays silent: no token, no UI, no message', async () => {
    socialLogin.refresh.mockRejectedValue(new Error('no saved account'));
    const auth = make();

    auth.requestToken({ prompt: '' });
    await flush();

    expect(socialLogin.login).not.toHaveBeenCalled();
    expect(auth.getAccessToken()).toBeNull();
    expect(reporter.sync).not.toHaveBeenCalled();
  });

  it('an interactive request falls back to the account picker when there is no saved session', async () => {
    socialLogin.getAuthorizationCode.mockResolvedValue({});
    const auth = make();

    auth.requestToken();
    await flush();

    expect(socialLogin.login).toHaveBeenCalledWith({ provider: 'google', options: { scopes: [DRIVE_APPDATA_SCOPE] } });
    expect(auth.getAccessToken()).toBe('tok-new');
  });

  it('an interactive request that does not complete tells the user', async () => {
    socialLogin.refresh.mockRejectedValue(new Error('none'));
    socialLogin.login.mockRejectedValue(new Error('cancelled'));
    const auth = make();

    auth.requestToken();
    await flush();

    expect(auth.getAccessToken()).toBeNull();
    expect(reporter.sync).toHaveBeenCalledWith("❌ Google sign-in didn't complete — check your connection and try again");
  });

  it('never writes the header connection status (that belongs to Health Connect)', async () => {
    const auth = make();
    auth.requestToken();
    await flush();
    expect(reporter.auth).not.toHaveBeenCalled();
  });

  it('signOut() ends the native session and forgets the token', async () => {
    const auth = make();
    auth.requestToken({ prompt: '' });
    await flush();

    await auth.signOut();

    expect(socialLogin.logout).toHaveBeenCalledWith({ provider: 'google' });
    expect(auth.getAccessToken()).toBeNull();
  });
});

describe('ST-020: native Google sign-in with a lazily loaded plugin', () => {
  it('accepts a promise of the plugin', async () => {
    const plugin = {
      initialize: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      getAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: 'tok' }),
    };
    const auth = createNativeGoogleAuth({ config: { CLIENT_ID: 'id' }, reporter: { sync: vi.fn() }, socialLogin: Promise.resolve(plugin) });

    auth.requestToken({ prompt: '' });
    await new Promise((r) => setTimeout(r, 0));

    expect(plugin.initialize).toHaveBeenCalledTimes(1);
    expect(auth.getAccessToken()).toBe('tok');
  });
});
