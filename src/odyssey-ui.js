/**
 * odyssey-ui.js — DOM renderer for the virtual expedition progression bar.
 *
 * Pairs with odyssey.js (pure engine). This module owns all DOM writes for
 * the odyssey section in #tab-lab (#lab-odyssey).
 *
 * Architecture constraints:
 * - No Dexie imports; analytics data arrives via analyticsEngine.compute().
 * - No innerHTML for user-supplied strings (XSS guard).
 * - AbortController per render() call — prevents listener accumulation.
 * - replaceChildren() for idempotent re-renders.
 * - Fail-open: errors from engine are caught, reporter.db() notified.
 */

import { MILESTONES } from './odyssey.js';

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates the odyssey UI renderer.
 *
 * @param {Document} doc - DOM document (injected for testability)
 * @param {{ computeOdysseyProgress: Function }} odysseyEngine - odyssey engine
 * @param {{ compute: Function }} analyticsEngine - analytics engine
 * @param {{ db: Function }} reporter - status reporter
 * @returns {{ render: Function }}
 */
export function createOdysseyUI(doc, odysseyEngine, analyticsEngine, reporter) {
  let controller = null;

  // ── Public API ─────────────────────────────────────────────────────────────

  async function render() {
    // Abort previous controller before creating a new one
    controller?.abort();
    controller = new AbortController();

    const container = _resolveContainer();
    if (!container) {
      console.warn('[odyssey-ui]', 'No suitable container found — skipping render');
      return;
    }

    try {
      const analyticsResult = await analyticsEngine.compute();
      const totalDistanceKm = analyticsResult.lifetimeMetrics.totalDistanceKm;

      const progress = odysseyEngine.computeOdysseyProgress(totalDistanceKm);

      const bar = _buildProgressBar(progress);
      container.replaceChildren(bar);
    } catch (err) {
      console.error('[odyssey-ui]', err);
      reporter.db('⚠️ Could not render Odyssey');
      const errP = doc.createElement('p');
      errP.textContent = 'Odyssey could not be loaded. Please try again.';
      container.replaceChildren(errP);
    }
  }

  // ── Section builders ───────────────────────────────────────────────────────

  /**
   * Builds the odyssey progression bar.
   *
   * @param {{ unlockedLegs: Array, activeLeg: Object|undefined, progressPct: number, remainingKm: number }} progress
   * @returns {HTMLElement}
   */
  function _buildProgressBar({ unlockedLegs, activeLeg, progressPct, remainingKm }) {
    const bar = doc.createElement('div');
    bar.className = 'odyssey-bar';

    const unlockedDestinations = new Set(unlockedLegs.map(l => l.destination));

    for (const milestone of MILESTONES) {
      const leg = _buildLeg(milestone, unlockedDestinations, activeLeg, progressPct, remainingKm);
      bar.appendChild(leg);
    }

    return bar;
  }

  /**
   * Builds a single leg element.
   *
   * @param {{ destination: string, distanceKm: number }} milestone
   * @param {Set<string>} unlockedDestinations
   * @param {{ destination: string, distanceKm: number }|undefined} activeLeg
   * @param {number} progressPct
   * @param {number} remainingKm
   * @returns {HTMLElement}
   */
  function _buildLeg(milestone, unlockedDestinations, activeLeg, progressPct, remainingKm) {
    const leg = doc.createElement('div');
    leg.className = 'odyssey-leg';

    const isUnlocked = unlockedDestinations.has(milestone.destination);
    const isActive = activeLeg !== undefined && activeLeg.destination === milestone.destination;

    let state;
    if (isUnlocked) {
      state = 'unlocked';
      leg.style.width = '100%';
    } else if (isActive) {
      state = 'active';
      leg.style.width = `${progressPct}%`;
    } else {
      state = 'locked';
    }

    leg.setAttribute('data-state', state);

    // Label: destination name + distance
    const label = doc.createElement('span');
    label.className = 'odyssey-leg-label';
    let labelText = `${milestone.destination} (${milestone.distanceKm} km)`;
    if (isActive) {
      labelText += ` — ${Math.round(remainingKm)} km remaining`;
    }
    label.textContent = labelText;
    leg.appendChild(label);

    return leg;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Resolves the odyssey container.
   * Prefers #lab-odyssey inside #tab-lab.
   * Falls back to #tab-lab directly.
   * Returns null only when neither is found.
   *
   * @returns {HTMLElement|null}
   */
  function _resolveContainer() {
    const existing = doc.getElementById('lab-odyssey');
    if (existing) return existing;

    return doc.querySelector('#tab-lab');
  }

  return { render };
}
