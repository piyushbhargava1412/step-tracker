import { describe, it, expect } from 'vitest';
import { renderViewerStatus, formatSnapshotTime } from './viewer-ui.js';

function buildDoc() {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML =
    '<span id="last-sync">Sync: —</span>' +
    '<button id="sync-btn" aria-label="Sync steps" title="Sync steps"><svg class="icon"></svg></button>';
  return doc;
}

describe('ST-023: viewer status line', () => {
  it('formats the snapshot time in local time', () => {
    const at = new Date(2026, 8, 28, 22, 31).toISOString();
    expect(formatSnapshotTime(at)).toBe('Sep 28, 2026 · 22:31');
  });

  it('shows how current the data is', () => {
    const doc = buildDoc();
    renderViewerStatus(doc, new Date(2026, 8, 28, 7, 5).toISOString());
    expect(doc.getElementById('last-sync').textContent).toBe('Data as of Sep 28, 2026 · 07:05');
  });

  it('before any snapshot', () => {
    const doc = buildDoc();
    renderViewerStatus(doc, null);
    expect(doc.getElementById('last-sync').textContent).toBe('No data yet');
  });

  it('an unreadable time counts as no snapshot', () => {
    const doc = buildDoc();
    renderViewerStatus(doc, 'not a date');
    expect(doc.getElementById('last-sync').textContent).toBe('No data yet');
  });

  it('the ↻ button refreshes from Google Drive, and keeps its icon', () => {
    const doc = buildDoc();
    renderViewerStatus(doc, null);
    const btn = doc.getElementById('sync-btn');
    expect(btn.getAttribute('aria-label')).toBe('Refresh from Google Drive');
    expect(btn.getAttribute('title')).toBe('Refresh from Google Drive');
    expect(btn.querySelector('svg')).not.toBeNull();
  });

  it('tolerates missing elements', () => {
    const doc = document.implementation.createHTMLDocument('t');
    expect(() => renderViewerStatus(doc, null)).not.toThrow();
  });
});
