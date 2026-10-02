/**
 * In-app update install (ST-028) — the JS side of the app-local ApkUpdater plugin
 * (android/app/src/main/java/.../ApkUpdaterPlugin.java).
 *
 * `downloadAndInstall(url)` downloads a release APK from GitHub and opens Android's
 * package installer, which asks the user to confirm and updates in place, keeping
 * the app's data (same signing key). It rejects with InstallPermissionError when
 * the "Install unknown apps" switch for this app is off — the plugin has already
 * opened that setting — and with the plugin's error for anything else.
 */
import { registerPlugin } from '@capacitor/core';

/** Rejection code: the user must allow installs from this app first. */
export const INSTALL_PERMISSION = 'INSTALL_PERMISSION';

export class InstallPermissionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InstallPermissionError';
  }
}

/**
 * @param {{ downloadAndInstall: (options: { url: string }) => Promise<void> }} [plugin]
 *   The native plugin; registered on first use when not given (app only).
 * @returns {{ downloadAndInstall: (url: string) => Promise<void> }}
 */
export function createApkInstaller(plugin) {
  let native = plugin;

  async function downloadAndInstall(url) {
    native ??= registerPlugin('ApkUpdater');
    try {
      await native.downloadAndInstall({ url });
    } catch (err) {
      if (err?.code === INSTALL_PERMISSION) throw new InstallPermissionError(err.message);
      throw err;
    }
  }

  return { downloadAndInstall };
}
