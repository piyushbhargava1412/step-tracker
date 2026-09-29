import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDriveAuthorization, NEEDS_CONSENT } from './drive-authorization.js';

const SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];

describe('ST-026: Drive authorization through Google Play services (no sign-in UI)', () => {
  let plugin;

  beforeEach(() => {
    plugin = { authorize: vi.fn().mockResolvedValue({ accessToken: 'tok-1' }) };
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('asks the native plugin for the scopes and the remembered account, and returns the token', async () => {
    const drive = createDriveAuthorization(plugin);
    await expect(drive.authorize({ scopes: SCOPES, account: 'me@example.com' })).resolves.toBe('tok-1');
    expect(plugin.authorize).toHaveBeenCalledWith({ scopes: SCOPES, account: 'me@example.com' });
  });

  it('leaves the account out when none is known yet', async () => {
    await createDriveAuthorization(plugin).authorize({ scopes: SCOPES });
    expect(plugin.authorize).toHaveBeenCalledWith({ scopes: SCOPES });
  });

  it('returns null, quietly, when Google needs the user again', async () => {
    plugin.authorize.mockRejectedValue(Object.assign(new Error('needs consent'), { code: NEEDS_CONSENT }));
    await expect(createDriveAuthorization(plugin).authorize({ scopes: SCOPES })).resolves.toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('returns null and logs any other failure (offline, Play services missing)', async () => {
    const err = new Error('network');
    plugin.authorize.mockRejectedValue(err);
    await expect(createDriveAuthorization(plugin).authorize({ scopes: SCOPES })).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith('[drive-authorization]', err);
  });

  it('returns null for a reply without a token', async () => {
    plugin.authorize.mockResolvedValue({});
    await expect(createDriveAuthorization(plugin).authorize({ scopes: SCOPES })).resolves.toBeNull();
  });

  it('uses the registered DriveAuthorization plugin by default', async () => {
    vi.resetModules();
    const registered = { authorize: vi.fn().mockResolvedValue({ accessToken: 'tok-app' }) };
    const registerPlugin = vi.fn(() => registered);
    vi.doMock('@capacitor/core', () => ({ registerPlugin }));
    const { createDriveAuthorization: create } = await import('./drive-authorization.js');

    await expect(create().authorize({ scopes: SCOPES })).resolves.toBe('tok-app');
    expect(registerPlugin).toHaveBeenCalledWith('DriveAuthorization');
    vi.doUnmock('@capacitor/core');
  });
});
