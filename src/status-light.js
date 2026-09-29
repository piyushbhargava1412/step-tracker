/**
 * Status pills with a coloured light (ST-027): a glowing dot — green (ok),
 * amber (warn) or red (error) — and a short label such as "Connected". The
 * full message stays available as the pill's tooltip and accessible name.
 *
 * Status messages across the app lead with a symbol (✅ ⚠️ ℹ️ 🔑 ❌);
 * `levelOf` turns that into a light colour and `stripSymbol` keeps the words.
 */

export const STATUS_OK = 'ok';
export const STATUS_WARN = 'warn';
export const STATUS_ERROR = 'error';

const OK_SYMBOLS = ['✅'];
const WARN_SYMBOLS = ['⚠️', '⚠', 'ℹ️', 'ℹ'];

/**
 * @param {string} text  a status message, e.g. "⚠️ Could not reach Health Connect"
 * @returns {string} STATUS_OK | STATUS_WARN | STATUS_ERROR (anything unrecognised is an error)
 */
export function levelOf(text) {
  const message = String(text ?? '');
  if (OK_SYMBOLS.some((s) => message.startsWith(s))) return STATUS_OK;
  if (WARN_SYMBOLS.some((s) => message.startsWith(s))) return STATUS_WARN;
  return STATUS_ERROR;
}

/** "⚠️ Could not reach Health Connect" → "Could not reach Health Connect". */
export function stripSymbol(text) {
  return String(text ?? '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

/**
 * Replace a pill's content with a light and a label.
 * @param {Document} doc
 * @param {HTMLElement} el
 * @param {{ level: string, label: string, detail?: string }} status
 */
export function renderStatusPill(doc, el, { level, label, detail = label }) {
  const light = doc.createElement('span');
  light.className = `status-light status-light--${level}`;
  light.setAttribute('aria-hidden', 'true');

  const text = doc.createElement('span');
  text.className = 'status-pill__label';
  text.textContent = label;

  el.replaceChildren(light, text);
  el.dataset.level = level;
  el.title = detail;
  el.setAttribute('aria-label', detail && detail !== label ? `${label}: ${detail}` : label);
}
