import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createNativeGoogleAuth, DRIVE_APPDATA_SCOPE, GOOGLE_DRIVE_ACCOUNT_KEY } from './google-auth.js';

/** In-memory localStorage stand-in. */
function makeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: vi.fn((key) => (key in data ? data[key] : null)),
    setItem: vi.fn((key, value) => { data[key] = String(value); }),
    removeItem: vi.fn((key) => { delete data[key]; }),
  };
}

describe('ST-020 / ST-026: native Google auth for Drive', () => {
  let socialLogin;
  let driveAuthorization;
  let storage;
  let reporter;
  const config = { CLIENT_ID: 'web-id' };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => {
    socialLogin = {
      initialize: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      getAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: 'tok-old' }),
      login: vi.fn().mockResolvedValue({
        provider: 'google',
        result: {
          responseType: 'online',
          accessToken: { token: 'tok-new' },
          idToken: null,
          profile: { email: 'me@example.com', id: '1', name: 'Me', imageUrl: null },
        },
      }),
      logout: vi.fn().mockResolvedValue(undefined),
    };
    driveAuthorization = { authorize: vi.fn().mockResolvedValue('tok-sil') };
    storage = makeStorage({ [GOOGLE_DRIVE_ACCOUNT_KEY]: 'me@example.com' });
    reporter = { sync: vi.fn(), auth: vi.fn() };
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  const make = () => createNativeGoogleAuth({ config, reporter, socialLogin, driveAuthorization, storage });

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

  describe('silent reconnect (prompt: "")', () => {
    it('gets a token from Play services authorization for the remembered account, and notifies listeners', async () => {
      const auth = make();
      const listener = vi.fn();
      auth.onTokenReceived(listener);
      auth.requestToken({ prompt: '' });
      await flush();
      expect(driveAuthorization.authorize).toHaveBeenCalledWith({ scopes: [DRIVE_APPDATA_SCOPE], account: 'me@example.com' });
      expect(auth.getAccessToken()).toBe('tok-sil');
      expect(listener).toHaveBeenCalledWith('tok-sil');
    });

    it('never runs a Credential Manager sign-in (the "Signing in as…" sheet)', async () => {
      make().requestToken({ prompt: '' });
      await flush();
      expect(socialLogin.refresh).not.toHaveBeenCalled();
      expect(socialLogin.login).not.toHaveBeenCalled();
    });

    it('works for installs connected before the account was remembered', async () => {
      storage = makeStorage();
      make().requestToken({ prompt: '' });
      await flush();
      expect(driveAuthorization.authorize).toHaveBeenCalledWith({ scopes: [DRIVE_APPDATA_SCOPE] });
    });

    it('stays silent when Google needs the user again: no token, no UI, no message', async () => {
      driveAuthorization.authorize.mockResolvedValue(null);
      const auth = make();
      const listener = vi.fn();
      auth.onTokenReceived(listener);
      auth.requestToken({ prompt: '' });
      await flush();
      expect(socialLogin.login).not.toHaveBeenCalled();
      expect(auth.getAccessToken()).toBeNull();
      expect(listener).not.toHaveBeenCalled();
      expect(reporter.sync).not.toHaveBeenCalled();
    });
  });

  describe('connect (interactive)', () => {
    it('uses the silent authorization when it already works — no sign-in UI', async () => {
      const auth = make();
      auth.requestToken();
      await flush();
      expect(socialLogin.login).not.toHaveBeenCalled();
      expect(auth.getAccessToken()).toBe('tok-sil');
    });

    it('otherwise signs in with the account picker and remembers the account (an email, never a token)', async () => {
      driveAuthorization.authorize.mockResolvedValue(null);
      storage = makeStorage();
      const auth = make();
      auth.requestToken();
      await flush();
      expect(socialLogin.login).toHaveBeenCalledWith({ provider: 'google', options: { scopes: [DRIVE_APPDATA_SCOPE] } });
      expect(auth.getAccessToken()).toBe('tok-new');
      expect(storage.setItem).toHaveBeenCalledWith(GOOGLE_DRIVE_ACCOUNT_KEY, 'me@example.com');
      expect(storage.setItem).not.toHaveBeenCalledWith(expect.anything(), 'tok-new');
    });

    it('a sign-in that does not complete tells the user', async () => {
      driveAuthorization.authorize.mockResolvedValue(null);
      socialLogin.login.mockRejectedValue(new Error('cancelled'));
      const auth = make();
      auth.requestToken();
      await flush();
      expect(auth.getAccessToken()).toBeNull();
      expect(reporter.sync).toHaveBeenCalledWith("❌ Google sign-in didn't complete — check your connection and try again");
    });

    it('a failing account store does not break the sign-in', async () => {
      driveAuthorization.authorize.mockResolvedValue(null);
      storage.setItem.mockImplementation(() => { throw new Error('quota'); });
      const auth = make();
      auth.requestToken();
      await flush();
      expect(auth.getAccessToken()).toBe('tok-new');
    });
  });

  describe('getFreshAccessToken() — before every Drive call', () => {
    it('returns a current token from Play services and keeps it', async () => {
      const auth = make();
      driveAuthorization.authorize.mockResolvedValue('tok-renewed');
      await expect(auth.getFreshAccessToken()).resolves.toBe('tok-renewed');
      expect(auth.getAccessToken()).toBe('tok-renewed');
    });

    it('falls back to the last token when Play services has none', async () => {
      const auth = make();
      auth.requestToken({ prompt: '' });
      await flush();
      driveAuthorization.authorize.mockResolvedValue(null);
      await expect(auth.getFreshAccessToken()).resolves.toBe('tok-sil');
    });

    it('does not ask Play services before the user ever connected', async () => {
      storage = makeStorage();
      await expect(make().getFreshAccessToken()).resolves.toBeNull();
      expect(driveAuthorization.authorize).not.toHaveBeenCalled();
    });
  });

  it('never writes the header connection status (that belongs to Health Connect)', async () => {
    const auth = make();
    auth.requestToken();
    await flush();
    expect(reporter.auth).not.toHaveBeenCalled();
  });

  it('signOut() ends the native session, forgets the token and the account', async () => {
    const auth = make();
    auth.requestToken({ prompt: '' });
    await flush();
    await auth.signOut();
    expect(socialLogin.logout).toHaveBeenCalledWith({ provider: 'google' });
    expect(auth.getAccessToken()).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(GOOGLE_DRIVE_ACCOUNT_KEY);
  });
});

describe('ST-020: native Google sign-in with a lazily loaded plugin', () => {
  it('accepts a promise of the plugin', async () => {
    const plugin = {
      initialize: vi.fn().mockResolvedValue(undefined),
      login: vi.fn().mockResolvedValue({ result: { accessToken: { token: 'tok' }, profile: { email: 'a@b.c' } } }),
    };
    const auth = createNativeGoogleAuth({
      config: { CLIENT_ID: 'id' },
      reporter: { sync: vi.fn() },
      socialLogin: Promise.resolve(plugin),
      driveAuthorization: { authorize: vi.fn().mockResolvedValue(null) },
      storage: makeStorage(),
    });
    auth.requestToken();
    await new Promise((r) => setTimeout(r, 0));
    expect(plugin.initialize).toHaveBeenCalledTimes(1);
    expect(auth.getAccessToken()).toBe('tok');
  });
});
