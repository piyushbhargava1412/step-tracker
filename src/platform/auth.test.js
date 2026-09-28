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
    const auth = selectAuth({ isNative: true, config, reporter, loadSocialLogin });
    expect(loadSocialLogin).toHaveBeenCalledTimes(1);
    expect(typeof auth.requestToken).toBe('function');
    expect(typeof auth.signOut).toBe('function');
  });
});
