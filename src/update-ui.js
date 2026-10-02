/**
 * Settings › App (ST-028, Android app only) — "Check for updates".
 * Factory: createUpdateUI(doc, { installedVersion, checker, installer, openExternal }) → { render }
 *
 *  - render(container) builds an "App" group: the installed version and a Check button.
 *    Nothing is fetched until the user taps Check. The container starts hidden (the web
 *    viewer never renders it) and is shown here.
 *  - Check → checker.check(): "You're on the latest version", a failure line, or the
 *    newer version with its release notes (plain text) and an Install button.
 *  - Install → installer.downloadAndInstall(apkUrl): the app downloads the APK and opens
 *    Android's installer. A missing "Install unknown apps" permission is explained; any
 *    other failure falls back to the browser's download via openExternal(apkUrl).
 *
 * No innerHTML — all DOM via createElement/textContent (release notes included).
 * AbortController-scoped delegated listener; event delegation via data-action.
 */
import { InstallPermissionError } from './platform/native/apk-installer.js';

const CHECK_LABEL = 'Check';
const CHECKING_LABEL = 'Checking…';
const DOWNLOADING_LABEL = 'Downloading…';
const CHECK_FAILED = "Couldn't check for updates. Check your connection and try again.";
const BROWSER_FALLBACK = "Couldn't download here — opening your browser instead.";

export function createUpdateUI(doc, { installedVersion, checker, installer, openExternal }) {
  let controller = null;
  let root = null;
  let update = null;

  const _el = (selector) => root?.querySelector(selector) ?? null;

  function render(container) {
    if (!container) {
      console.warn('[update-ui]', 'Missing #app-update container — skipping render');
      return;
    }
    controller?.abort();
    controller = new (doc.defaultView?.AbortController ?? AbortController)();
    while (container.firstChild) container.removeChild(container.firstChild);
    root = container;
    update = null;

    const body = doc.createElement('div');
    body.className = 'settings-body';
    const heading = doc.createElement('h2');
    heading.className = 'list-label';
    heading.textContent = 'App';

    const group = doc.createElement('div');
    group.className = 'list-group';

    const row = doc.createElement('div');
    row.className = 'list-row';
    const text = doc.createElement('span');
    text.className = 'list-row__text';
    const title = doc.createElement('span');
    title.className = 'list-row__title';
    title.textContent = 'Updates';
    const sub = doc.createElement('span');
    sub.className = 'list-row__sub';
    sub.textContent = `Version ${installedVersion}`;
    text.append(title, sub);
    const checkBtn = doc.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'btn btn-secondary btn-small';
    checkBtn.dataset.action = 'check-update';
    checkBtn.textContent = CHECK_LABEL;
    row.append(text, checkBtn);

    const result = doc.createElement('div');
    result.className = 'list-row list-row--stack app-update__result';
    result.dataset.updateStatus = '';
    result.setAttribute('role', 'status');
    result.setAttribute('aria-live', 'polite');
    result.hidden = true;

    group.append(row, result);
    body.append(heading, group);
    container.appendChild(body);
    container.hidden = false;
    group.addEventListener('click', _handleClick, { signal: controller.signal });
  }

  function _handleClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    if (target.dataset.action === 'check-update') _check();
    else if (target.dataset.action === 'install-update') _install();
  }

  async function _check() {
    const btn = _el('[data-action="check-update"]');
    btn.disabled = true;
    btn.textContent = CHECKING_LABEL;
    _showResult();
    try {
      update = await checker.check();
      if (update) _showAvailable(update);
      else _showResult(`You're on the latest version (${installedVersion}).`);
    } catch (err) {
      console.error('[update-ui]', err);
      update = null;
      _showResult(CHECK_FAILED);
    } finally {
      btn.disabled = false;
      btn.textContent = CHECK_LABEL;
    }
  }

  /** Replace the result area's content; no message hides it. */
  function _showResult(message) {
    const result = _el('[data-update-status]');
    while (result.firstChild) result.removeChild(result.firstChild);
    result.hidden = !message;
    if (message) {
      const line = doc.createElement('p');
      line.className = 'app-update__message';
      line.textContent = message;
      result.appendChild(line);
    }
    return result;
  }

  function _showAvailable({ version, notes }) {
    const result = _showResult(`Version ${version} is available.`);
    result.firstChild.classList.add('app-update__message--new');
    if (notes) {
      const notesEl = doc.createElement('p');
      notesEl.className = 'app-update__notes';
      notesEl.textContent = notes;
      result.appendChild(notesEl);
    }
    const installBtn = doc.createElement('button');
    installBtn.type = 'button';
    installBtn.className = 'btn btn-primary btn-block';
    installBtn.dataset.action = 'install-update';
    installBtn.textContent = _installLabel(version);
    const message = doc.createElement('p');
    message.className = 'app-update__message';
    message.dataset.installMessage = '';
    message.hidden = true;
    result.append(installBtn, message);
  }

  const _installLabel = (version) => `Install version ${version}`;

  async function _install() {
    if (!update) return;
    const { version, apkUrl } = update;
    const btn = _el('[data-action="install-update"]');
    const message = _el('[data-install-message]');
    btn.disabled = true;
    btn.textContent = DOWNLOADING_LABEL;
    message.hidden = true;
    try {
      await installer.downloadAndInstall(apkUrl);
    } catch (err) {
      if (err instanceof InstallPermissionError) {
        message.textContent = err.message;
      } else {
        console.error('[update-ui]', err);
        message.textContent = BROWSER_FALLBACK;
        openExternal(apkUrl);
      }
      message.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = _installLabel(version);
    }
  }

  return { render };
}
