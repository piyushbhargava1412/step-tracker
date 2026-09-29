/**
 * First-launch welcome (#onboarding).
 *
 * Shown over the app until the user connects their step source, restores a
 * backup, or taps "Not now" — and only while there is no step data and it was
 * never dismissed before. main.js calls dismiss() when the connection
 * succeeds (the connection keeps a single onConnected listener, which main owns).
 */

export const ONBOARDING_DONE_KEY = 'onboarding_done';

/**
 * @param {Document} doc
 * @param {{
 *   storage: Storage,
 *   connection: { label: string, connect: () => Promise<void> },
 *   sourceName: string,                 e.g. "Health Connect"
 *   hasData: () => Promise<boolean>,
 *   onRestore?: () => void,             opens Backup & restore
 *   intro?: string,                     replaces the "reads your daily steps from …" text
 * }} deps
 * @returns {{ start: () => Promise<void>, dismiss: () => void, isOpen: () => boolean }}
 */
export function createOnboardingUI(doc, { storage, connection, sourceName, hasData, onRestore = () => {}, intro }) {
  const root = () => doc.getElementById('onboarding');
  let bound = false;

  function _wasDismissed() {
    try {
      return storage?.getItem(ONBOARDING_DONE_KEY) === '1';
    } catch (err) {
      console.error('[onboarding]', err);
      return false;
    }
  }

  function dismiss() {
    const el = root();
    if (el) el.hidden = true;
    doc.body?.classList.remove('has-onboarding');
    try {
      storage?.setItem(ONBOARDING_DONE_KEY, '1');
    } catch (err) {
      console.error('[onboarding]', err);
    }
  }

  function _bind() {
    if (bound) return;
    bound = true;
    doc.getElementById('onboarding-connect')?.addEventListener('click', () => {
      try {
        Promise.resolve(connection.connect()).catch((err) => console.error('[onboarding]', err));
      } catch (err) {
        console.error('[onboarding]', err);
      }
    });
    doc.getElementById('onboarding-restore')?.addEventListener('click', () => {
      dismiss();
      onRestore();
    });
    doc.getElementById('onboarding-skip')?.addEventListener('click', dismiss);
  }

  async function start() {
    const el = root();
    if (!el || _wasDismissed()) return;

    let dataPresent = false;
    try {
      dataPresent = await hasData();
    } catch (err) {
      console.error('[onboarding]', err);
    }
    if (dataPresent) return;

    const connectBtn = doc.getElementById('onboarding-connect');
    if (connectBtn) connectBtn.textContent = connection.label;
    const text = doc.getElementById('onboarding-text');
    if (text) {
      text.textContent = intro ?? `Step Tracker reads your daily steps from ${sourceName}. Everything stays on this device.`;
    }
    _bind();
    el.hidden = false;
    doc.body?.classList.add('has-onboarding');
  }

  return { start, dismiss, isOpen: () => root()?.hidden === false };
}
