// tabs.js — client-side tab navigation (Task 8)
//
// Panel show/hide mechanism (for Task 10 — styles.css):
//   Hidden panels: element.style.display = 'none'
//   Visible panel: element.style.display = 'block'
// Task 10 should ensure all [id^="tab-"] panels default to display:none in CSS;
// this JS overrides to 'block' for the active panel.

/**
 * Hide all panels whose id starts with "tab-", then show the one matching tabName.
 * @param {string} tabName - The tab identifier (e.g. 'dashboard')
 * @param {Document} doc - Injected document (defaults to global document for testability)
 */
export function switchTab(tabName, doc = document) {
  const panels = doc.querySelectorAll('[id^="tab-"]');
  panels.forEach(panel => { panel.style.display = 'none'; });
  const active = doc.getElementById(`tab-${tabName}`);
  if (active) active.style.display = 'block';

  const buttons = doc.querySelectorAll('[data-tab]');
  buttons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
}

/**
 * Attach ONE delegated click listener on barEl.
 * Reads event.target.closest('[data-tab]')?.dataset.tab and calls switchTab.
 * Re-calling initTabs replaces the previous listener (uses AbortController pattern
 * via a stored symbol on the element to avoid listener accumulation).
 * @param {Element} barEl - The tab-bar container element
 * @param {Document} doc - Injected document for testability
 */
export function initTabs(barEl, doc = document) {
  // Remove any previously attached listener to prevent accumulation on re-init
  if (barEl._tabsAbort) barEl._tabsAbort.abort();
  const controller = new AbortController();
  barEl._tabsAbort = controller;

  barEl.addEventListener('click', (event) => {
    const tabName = event.target.closest('[data-tab]')?.dataset.tab;
    if (tabName) switchTab(tabName, doc);
  }, { signal: controller.signal });
}
