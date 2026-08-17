import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuth } from './auth.js';

describe('createAuth', () => {
  let config, reporter, mockGsi, capturedCallback, mockTokenClient, auth;

  beforeEach(() => {
    config = { CLIENT_ID: 'cid_001' };
    reporter = { auth: vi.fn(), db: vi.fn() };
    capturedCallback = null;
    mockTokenClient = { requestAccessToken: vi.fn() };
    mockGsi = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((opts) => {
            capturedCallback = opts.callback;
            return mockTokenClient;
          }),
        },
      },
    };
    auth = createAuth(config, reporter, mockGsi);
    auth.init();
  });

  it('init() calls initTokenClient exactly once', () => {
    expect(mockGsi.accounts.oauth2.initTokenClient).toHaveBeenCalledTimes(1);
  });

  it('initTokenClient receives client_id matching config.CLIENT_ID', () => {
    const [opts] = mockGsi.accounts.oauth2.initTokenClient.mock.calls[0];
    expect(opts.client_id).toBe(config.CLIENT_ID);
  });

  it('initTokenClient receives scope containing fitness.activity.read', () => {
    const [opts] = mockGsi.accounts.oauth2.initTokenClient.mock.calls[0];
    expect(opts.scope).toContain('fitness.activity.read');
  });

  it('initTokenClient receives scope containing fitness.location.read', () => {
    const [opts] = mockGsi.accounts.oauth2.initTokenClient.mock.calls[0];
    expect(opts.scope).toContain('fitness.location.read');
  });

  it('both scopes delivered as a single space-delimited string', () => {
    const [opts] = mockGsi.accounts.oauth2.initTokenClient.mock.calls[0];
    expect(opts.scope.split(' ').length).toBe(3);
  });

  it('callback with valid access_token stores the token', () => {
    capturedCallback({ access_token: 'tok-123' });
    expect(auth.getAccessToken()).toBe('tok-123');
  });

  it('callback with valid access_token calls reporter.auth with Connected', () => {
    capturedCallback({ access_token: 'tok-123' });
    expect(reporter.auth).toHaveBeenCalledWith('✅ Connected');
  });

  it('callback with undefined response does not store a token', () => {
    capturedCallback(undefined);
    expect(auth.getAccessToken()).toBeNull();
  });

  it('callback with { access_token: undefined } does not report Connected', () => {
    capturedCallback({ access_token: undefined });
    expect(reporter.auth).not.toHaveBeenCalledWith('✅ Connected');
  });

  it('callback with empty string access_token is treated as missing', () => {
    capturedCallback({ access_token: '' });
    expect(auth.getAccessToken()).toBeNull();
  });

  it('requestToken() delegates to tokenClient.requestAccessToken()', () => {
    auth.requestToken();
    expect(mockTokenClient.requestAccessToken).toHaveBeenCalledTimes(1);
  });

  it('requestToken({ prompt: "" }) delegates the silent-restore options to tokenClient', () => {
    auth.requestToken({ prompt: '' });
    expect(mockTokenClient.requestAccessToken).toHaveBeenCalledTimes(1);
    expect(mockTokenClient.requestAccessToken).toHaveBeenCalledWith({ prompt: '' });
  });

  it('requestToken({ prompt: "" }) is passed through as-is (empty prompt must not be dropped)', () => {
    auth.requestToken({ prompt: '' });
    const [args] = mockTokenClient.requestAccessToken.mock.calls[0];
    expect(args.prompt).toBe('');
  });

  it('requestToken() before init() is guarded and does not throw', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const uninitialized = createAuth(config, reporter, mockGsi);
    expect(() => uninitialized.requestToken()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      '[auth] requestToken() called before init()'
    );
    errorSpy.mockRestore();
  });

  it('onTokenReceived registers a listener invoked with the token on valid callback', () => {
    const listener = vi.fn();
    auth.onTokenReceived(listener);
    capturedCallback({ access_token: 'tok-456' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('tok-456');
  });

  it('onTokenReceived listener is not invoked when the callback carries no token', () => {
    const listener = vi.fn();
    auth.onTokenReceived(listener);
    capturedCallback({ error: 'access_denied' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('onTokenReceived listener fires after the Connected report', () => {
    const order = [];
    reporter.auth.mockImplementation(() => order.push('report'));
    const listener = vi.fn(() => order.push('listener'));
    auth.onTokenReceived(listener);
    capturedCallback({ access_token: 'tok-789' });
    expect(order).toEqual(['report', 'listener']);
  });

  it('token is not exposed on window', () => {
    capturedCallback({ access_token: 'tok-123' });
    expect(window.accessToken).toBeUndefined();
  });

  it('initTokenClient receives scope containing drive.appdata', () => {
    const [opts] = mockGsi.accounts.oauth2.initTokenClient.mock.calls[0];
    expect(opts.scope).toContain('https://www.googleapis.com/auth/drive.appdata');
  });

  it('all three scopes are space-delimited with no comma or semicolon', () => {
    const [opts] = mockGsi.accounts.oauth2.initTokenClient.mock.calls[0];
    const parts = opts.scope.split(' ').filter(Boolean);
    expect(parts).toHaveLength(3);
    expect(opts.scope).not.toContain(',');
    expect(opts.scope).not.toContain(';');
  });

});

describe('createAuth — GSI unavailable at init() time', () => {
  let config, reporter;

  beforeEach(() => {
    config = { CLIENT_ID: 'cid_001' };
    reporter = { auth: vi.fn(), db: vi.fn() };
  });

  it('createAuth(config, reporter) does not throw even when no third arg is passed', () => {
    expect(() => createAuth(config, reporter)).not.toThrow();
  });

  it('init() with no gsi and no window.google logs an error instead of throwing', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const auth = createAuth(config, reporter, undefined);

    expect(() => auth.init()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      '[auth] Google Identity Services unavailable — init() aborted'
    );
    errorSpy.mockRestore();
  });

  it('init() with a gsi missing accounts.oauth2 logs an error instead of throwing', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const auth = createAuth(config, reporter, {});

    expect(() => auth.init()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      '[auth] Google Identity Services unavailable — init() aborted'
    );
    errorSpy.mockRestore();
  });

  it('requestToken() after a failed init() is still guarded and does not throw', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const auth = createAuth(config, reporter, undefined);
    auth.init();

    expect(() => auth.requestToken()).not.toThrow();
  });
});
