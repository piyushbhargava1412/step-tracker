import { describe, it, expect, vi } from 'vitest';
import { createApkInstaller, InstallPermissionError, INSTALL_PERMISSION } from './apk-installer.js';

const URL = 'https://github.com/piyushbhargava1412/step-tracker/releases/download/v0.4.1/step-tracker-0.4.1.apk';

describe('ST-028: in-app APK installer (ApkUpdater native plugin)', () => {
  it('hands the release link to the native plugin', async () => {
    const plugin = { downloadAndInstall: vi.fn().mockResolvedValue(undefined) };
    await createApkInstaller(plugin).downloadAndInstall(URL);
    expect(plugin.downloadAndInstall).toHaveBeenCalledWith({ url: URL });
  });

  it('turns the plugin\'s INSTALL_PERMISSION rejection into an InstallPermissionError', async () => {
    const plugin = {
      downloadAndInstall: vi.fn().mockRejectedValue(
        Object.assign(new Error('Allow installs from Step Tracker, then tap Install again.'), { code: INSTALL_PERMISSION }),
      ),
    };
    const attempt = createApkInstaller(plugin).downloadAndInstall(URL);
    await expect(attempt).rejects.toBeInstanceOf(InstallPermissionError);
    await expect(attempt).rejects.toThrow('Allow installs from Step Tracker');
  });

  it('passes any other failure through unchanged', async () => {
    const err = new Error('Download failed (HTTP 404).');
    const plugin = { downloadAndInstall: vi.fn().mockRejectedValue(err) };
    await expect(createApkInstaller(plugin).downloadAndInstall(URL)).rejects.toBe(err);
  });
});
