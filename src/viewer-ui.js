/**
 * Today status line in the read-only web viewer (ST-023): "Data as of …" in
 * place of the last-sync label, and the ↻ button labelled for what it does
 * there — re-download the snapshot from Google Drive.
 */
import { _formatReadableDate, _localDate } from './date-utils.js';

const REFRESH_LABEL = 'Refresh from Google Drive';

/**
 * "Sep 28, 2026 · 22:31" in local time, or null for a missing/invalid time.
 * @param {string|null} iso
 * @returns {string|null}
 */
export function formatSnapshotTime(iso) {
  const ms = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${_formatReadableDate(_localDate(ms))} · ${time}`;
}

/**
 * @param {Document} doc
 * @param {string|null} snapshotAt  the shown snapshot's export time
 */
export function renderViewerStatus(doc, snapshotAt) {
  const label = doc.getElementById('last-sync');
  if (label) {
    const when = formatSnapshotTime(snapshotAt);
    label.textContent = when ? `Data as of ${when}` : 'No data yet';
  }
  const btn = doc.getElementById('sync-btn');
  if (btn) {
    btn.setAttribute('aria-label', REFRESH_LABEL);
    btn.setAttribute('title', REFRESH_LABEL);
  }
}
