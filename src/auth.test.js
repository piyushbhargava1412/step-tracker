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
    expect(opts.scope.split(' ').length).toBe(2);
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

  it('token is not exposed on window', () => {
    capturedCallback({ access_token: 'tok-123' });
    expect(window.accessToken).toBeUndefined();
  });
});
