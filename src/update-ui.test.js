import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUpdateUI } from './update-ui.js';
import { InstallPermissionError } from './platform/native/apk-installer.js';

const UPDATE = {
  version: '0.4.1',
  notes: '- Faster sync\n- <b>not markup</b>',
  apkUrl: 'https://github.com/piyushbhargava1412/step-tracker/releases/download/v0.4.1/step-tracker-0.4.1.apk',
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ST-028: Settings › App updates', () => {
  let container;
  let checker;
  let installer;
  let openExternal;

  const mount = () => {
    const ui = createUpdateUI(document, { installedVersion: '0.4.0', checker, installer, openExternal });
    ui.render(container);
    return ui;
  };
  const button = (action) => container.querySelector(`[data-action="${action}"]`);
  const status = () => container.querySelector('[data-update-status]');

  beforeEach(() => {
    document.body.innerHTML = '<div id="app-update" hidden></div>';
    container = document.getElementById('app-update');
    checker = { check: vi.fn().mockResolvedValue(null) };
    installer = { downloadAndInstall: vi.fn().mockResolvedValue(undefined) };
    openExternal = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders an "App" group with the installed version and a Check button, without checking yet', () => {
    mount();
    expect(container.querySelector('.list-label').textContent).toBe('App');
    expect(container.textContent).toContain('Version 0.4.0');
    expect(button('check-update').textContent).toBe('Check');
    expect(status().getAttribute('aria-live')).toBe('polite');
    expect(checker.check).not.toHaveBeenCalled();
    expect(container.hidden).toBe(false);
  });

  it('is idempotent: a second render leaves one group and one listener', async () => {
    const ui = mount();
    ui.render(container);
    expect(container.querySelectorAll('.list-group')).toHaveLength(1);
    button('check-update').click();
    await flush();
    expect(checker.check).toHaveBeenCalledTimes(1);
  });

  it('shows "Checking…" and disables the button while the check runs', async () => {
    let finish;
    checker.check.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    mount();
    button('check-update').click();
    expect(button('check-update').disabled).toBe(true);
    expect(button('check-update').textContent).toBe('Checking…');
    finish(null);
    await flush();
    expect(button('check-update').disabled).toBe(false);
    expect(button('check-update').textContent).toBe('Check');
  });

  it('says so when already on the latest version', async () => {
    mount();
    button('check-update').click();
    await flush();
    expect(status().textContent).toBe("You're on the latest version (0.4.0).");
    expect(button('install-update')).toBeNull();
  });

  it('reports a failed check without throwing', async () => {
    const err = new Error('Update check failed (403)');
    checker.check.mockRejectedValue(err);
    mount();
    button('check-update').click();
    await flush();
    expect(status().textContent).toBe("Couldn't check for updates. Check your connection and try again.");
    expect(console.error).toHaveBeenCalledWith('[update-ui]', err);
  });

  it('offers a newer version with its notes as plain text and an Install button', async () => {
    checker.check.mockResolvedValue(UPDATE);
    mount();
    button('check-update').click();
    await flush();
    expect(status().textContent).toContain('Version 0.4.1 is available.');
    const notes = container.querySelector('.app-update__notes');
    expect(notes.textContent).toBe(UPDATE.notes);
    expect(notes.querySelector('b')).toBeNull();
    expect(button('install-update').textContent).toBe('Install version 0.4.1');
  });

  it('a release without notes shows no notes block', async () => {
    checker.check.mockResolvedValue({ ...UPDATE, notes: '' });
    mount();
    button('check-update').click();
    await flush();
    expect(container.querySelector('.app-update__notes')).toBeNull();
  });

  it('Install downloads in the app and hands the APK to Android\'s installer', async () => {
    checker.check.mockResolvedValue(UPDATE);
    mount();
    button('check-update').click();
    await flush();
    button('install-update').click();
    expect(button('install-update').disabled).toBe(true);
    expect(button('install-update').textContent).toBe('Downloading…');
    await flush();
    expect(installer.downloadAndInstall).toHaveBeenCalledWith(UPDATE.apkUrl);
    expect(openExternal).not.toHaveBeenCalled();
    expect(button('install-update').disabled).toBe(false);
    expect(button('install-update').textContent).toBe('Install version 0.4.1');
  });

  it('explains a missing "Install unknown apps" permission instead of falling back', async () => {
    checker.check.mockResolvedValue(UPDATE);
    installer.downloadAndInstall.mockRejectedValue(
      new InstallPermissionError('Allow installs from Walkaholic, then tap Install again.'),
    );
    mount();
    button('check-update').click();
    await flush();
    button('install-update').click();
    await flush();
    expect(container.querySelector('[data-install-message]').textContent).toBe(
      'Allow installs from Walkaholic, then tap Install again.',
    );
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('falls back to the browser download when the in-app download fails', async () => {
    checker.check.mockResolvedValue(UPDATE);
    const err = new Error('Download failed (HTTP 500).');
    installer.downloadAndInstall.mockRejectedValue(err);
    mount();
    button('check-update').click();
    await flush();
    button('install-update').click();
    await flush();
    expect(openExternal).toHaveBeenCalledWith(UPDATE.apkUrl);
    expect(container.querySelector('[data-install-message]').textContent).toBe(
      "Couldn't download here — opening your browser instead.",
    );
    expect(console.error).toHaveBeenCalledWith('[update-ui]', err);
  });

  it('a fresh check clears the previous result', async () => {
    checker.check.mockResolvedValueOnce(UPDATE).mockResolvedValueOnce(null);
    mount();
    button('check-update').click();
    await flush();
    button('check-update').click();
    await flush();
    expect(button('install-update')).toBeNull();
    expect(status().textContent).toBe("You're on the latest version (0.4.0).");
  });
});
