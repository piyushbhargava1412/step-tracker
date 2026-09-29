import { describe, it, expect, vi } from 'vitest';
import { selectAuth } from './auth.js';

vi.mock('../auth.js', () => ({ createAuth: vi.fn(() => ({ kind: 'web' })) }));
import { createAuth } from '../auth.js';

describe('ST-020: selectAuth', () => {
  const config = { CLIENT_ID: 'id' };
  const reporter = { sync: vi.fn() };

  it('uses Google Identity Services in the browser, without loading the native plugin', () => {
    const loadSocialLogin = vi.fn();
    expect(selectAuth({ isNative: false, config, reporter, loadSocialLogin })).toEqual({ kind: 'web' });
    expect(loadSocialLogin).not.toHaveBeenCalled();
    expect(createAuth).toHaveBeenCalledWith(config, reporter);
  });

  it('uses native Google sign-in in the Android app', () => {
    const loadSocialLogin = vi.fn(() => Promise.resolve({ initialize: vi.fn() }));
    const loadDriveAuthorization = vi.fn(() => ({ authorize: vi.fn() }));
    const auth = selectAuth({ isNative: true, config, reporter, loadSocialLogin, loadDriveAuthorization });
    expect(loadSocialLogin).toHaveBeenCalledTimes(1);
    expect(loadDriveAuthorization).toHaveBeenCalledTimes(1);
    expect(typeof auth.requestToken).toBe('function');
    expect(typeof auth.signOut).toBe('function');
  });

  it('ST-026: the app renews Drive tokens silently; the browser build never loads the native authorization', async () => {
    const authorize = vi.fn().mockResolvedValue('tok-renewed');
    const storage = { getItem: vi.fn(() => 'me@example.com'), setItem: vi.fn(), removeItem: vi.fn() };
    const auth = selectAuth({
      isNative: true,
      config,
      reporter,
      storage,
      loadSocialLogin: () => Promise.resolve({ initialize: vi.fn() }),
      loadDriveAuthorization: () => ({ authorize }),
    });
    await expect(auth.getFreshAccessToken()).resolves.toBe('tok-renewed');

    const loadDriveAuthorization = vi.fn();
    selectAuth({ isNative: false, config, reporter, loadDriveAuthorization });
    expect(loadDriveAuthorization).not.toHaveBeenCalled();
  });
});
