/**
 * odyssey-ui.js — DOM renderer for the virtual expedition route.
 *
 * Pairs with odyssey.js (pure engine). This module owns all DOM writes for
 * the expedition card on the Journey screen (#lab-odyssey): the distance
 * walked, then the route as a vertical list — home base, then each
 * destination, the line into it filled as far as the user has walked.
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

      const section = doc.createElement('section');
      section.className = 'card odyssey-section';

      const h2 = doc.createElement('h2');
      h2.className = 'section-title';
      h2.textContent = 'Virtual expedition';
      section.appendChild(h2);

      const sub = doc.createElement('p');
      sub.className = 'section-sub';
      sub.textContent = 'From your home city · change it in Settings';
      section.appendChild(sub);

      const distEl = doc.createElement('p');
      distEl.className = 'odyssey-distance';
      const km = doc.createElement('span');
      km.className = 'odyssey-distance__km';
      km.textContent = `${Math.round(totalDistanceKm).toLocaleString('en-US')} km`;
      distEl.append(km, doc.createTextNode(' walked so far'));
      section.appendChild(distEl);

      section.appendChild(_buildProgressBar(progress));

      const activeLabel = progress.activeLeg
        ? `Next stop: ${progress.activeLeg.destination} — ${Math.round(progress.remainingKm).toLocaleString('en-US')} km remaining`
        : 'All destinations unlocked!';
      const legInfo = doc.createElement('p');
      legInfo.className = 'odyssey-leg-info';
      legInfo.textContent = activeLabel;
      section.appendChild(legInfo);

      container.replaceChildren(section);
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
   * Builds the route: home base, then one row per destination.
   *
   * @param {{ unlockedLegs: Array, activeLeg: Object|undefined, progressPct: number, remainingKm: number }} progress
   * @returns {HTMLElement}
   */
  function _buildProgressBar({ unlockedLegs, activeLeg, progressPct, remainingKm }) {
    const route = doc.createElement('ol');
    route.className = 'odyssey-bar odyssey-route';

    const start = doc.createElement('li');
    start.className = 'odyssey-stop odyssey-stop--start';
    const startDot = doc.createElement('span');
    startDot.className = 'odyssey-leg__dot';
    start.appendChild(_wrapRail(null, startDot));
    start.appendChild(_buildText('Home base', 'Start', '0 km'));
    route.appendChild(start);

    const unlockedDestinations = new Set(unlockedLegs.map(l => l.destination));
    for (const milestone of MILESTONES) {
      route.appendChild(_buildLeg(milestone, unlockedDestinations, activeLeg, progressPct, remainingKm));
    }
    return route;
  }

  /**
   * One destination row: the line walked into it (filled to the progress),
   * its dot, name, status and cumulative distance.
   */
  function _buildLeg(milestone, unlockedDestinations, activeLeg, progressPct, remainingKm) {
    const leg = doc.createElement('li');
    leg.className = 'odyssey-leg';

    const isUnlocked = unlockedDestinations.has(milestone.destination);
    const isActive = activeLeg !== undefined && activeLeg.destination === milestone.destination;
    const state = isUnlocked ? 'unlocked' : isActive ? 'active' : 'locked';
    leg.setAttribute('data-state', state);

    const line = doc.createElement('span');
    line.className = 'odyssey-leg__line';
    const fill = doc.createElement('span');
    fill.className = 'odyssey-leg__progress';
    fill.style.height = isUnlocked ? '100%' : isActive ? `${Math.round(progressPct)}%` : '0%';
    line.appendChild(fill);

    const dot = doc.createElement('span');
    dot.className = 'odyssey-leg__dot';
    leg.appendChild(_wrapRail(line, dot));

    const status = isUnlocked
      ? 'Reached'
      : isActive
        ? `${Math.round(remainingKm).toLocaleString('en-US')} km to go`
        : 'Ahead';
    leg.appendChild(_buildText(milestone.destination, status, `${milestone.distanceKm.toLocaleString('en-US')} km`));
    if (isActive) leg.setAttribute('aria-current', 'step');
    return leg;
  }

  function _wrapRail(line, dot) {
    const rail = doc.createElement('span');
    rail.className = 'odyssey-leg__rail';
    rail.setAttribute('aria-hidden', 'true');
    if (line) rail.appendChild(line);
    rail.appendChild(dot);
    return rail;
  }

  function _buildText(name, status, distance) {
    const text = doc.createElement('span');
    text.className = 'odyssey-leg-label';
    const nameEl = doc.createElement('span');
    nameEl.className = 'odyssey-leg__name';
    nameEl.textContent = name;
    const statusEl = doc.createElement('span');
    statusEl.className = 'odyssey-leg__status';
    statusEl.textContent = status;
    const kmEl = doc.createElement('span');
    kmEl.className = 'odyssey-leg__km';
    kmEl.textContent = distance;
    text.append(nameEl, statusEl);
    const wrap = doc.createDocumentFragment();
    const row = doc.createElement('span');
    row.className = 'odyssey-leg__body';
    row.append(text, kmEl);
    wrap.appendChild(row);
    return wrap;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Resolves the odyssey container.
   * Prefers #lab-odyssey on the Journey screen.
   * Falls back to #tab-journey directly.
   * Returns null only when neither is found.
   *
   * @returns {HTMLElement|null}
   */
  function _resolveContainer() {
    const existing = doc.getElementById('lab-odyssey');
    if (existing) return existing;

    return doc.querySelector('#tab-journey');
  }

  return { render };
}
