/**
 * gamification-ui.js — DOM renderer for the RPG level card and trophy case.
 *
 * Pairs with gamification.js (pure engine). This module owns all DOM writes for
 * the gamification section on the Journey screen (#lab-gamification): the
 * level card, then the trophy case with an earned count.
 *
 * Architecture constraints:
 * - No Dexie imports; all data arrives via engine.compute().
 * - No innerHTML for user-supplied strings (XSS guard).
 * - AbortController per render() call — prevents listener accumulation.
 * - replaceChildren() for idempotent re-renders.
 * - Fail-open: errors from engine are caught, reporter.db() notified.
 *
 * SF-1:  Pure CSS <div> bars only — no charting library (icons are inline SVG).
 * SF-11: Level cap at 50 with "(MAX)" suffix; progress bar clamped to 100%.
 * SF-13: render() catch → console.error + reporter.db + error <p>.
 */

import { createIcon } from './icons.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_LEVEL = 50;

const TROPHY_DEFINITIONS = [
  {
    key: 'centurion',
    icon: 'trophy',
    title: 'Centurion',
    description: 'Walk 100,000+ steps in a single ISO week',
  },
  {
    key: 'marathoner',
    icon: 'shoe',
    title: 'Marathoner',
    description: 'Walk 55,000+ steps in a single day',
  },
  {
    key: 'unstoppable',
    icon: 'flame',
    title: 'Unstoppable',
    description: 'Maintain a 30-day step streak',
  },
  {
    key: 'nightOwl',
    icon: 'moon',
    title: 'Night Owl',
    description: 'Walk 2,000+ steps across midnight (11 PM–3 AM)',
  },
];

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates the gamification UI renderer.
 *
 * @param {Document} doc - DOM document (injected for testability)
 * @param {{ compute: Function }} engine - gamification engine (gamification.js factory)
 * @param {{ db: Function }} reporter - status reporter
 * @returns {{ render: Function }}
 */
export function createGamificationUI(doc, engine, reporter) {
  let controller = null;

  // ── Public API ─────────────────────────────────────────────────────────────

  async function render() {
    // Abort previous controller before creating a new one
    controller?.abort();
    controller = new AbortController();

    // Resolve the container
    const container = _resolveContainer();
    if (!container) {
      console.warn('[gamification-ui]', 'No suitable container found — skipping render');
      return;
    }

    try {
      const result = await engine.compute();

      const section = doc.createElement('section');
      section.className = 'gamification-section';

      section.appendChild(_buildLevelCard(result));
      section.appendChild(_buildTrophyHeader(result.achievements));
      section.appendChild(_buildTrophyGrid(result.achievements));

      container.replaceChildren(section);
    } catch (err) {
      console.error('[gamification-ui]', err);
      reporter.db('⚠️ Could not render Gamification');
      const errP = doc.createElement('p');
      errP.textContent = 'Gamification could not be loaded. Please try again.';
      container.replaceChildren(errP);
    }
  }

  // ── Section builders ───────────────────────────────────────────────────────

  /**
   * Builds the RPG level card.
   *
   * @param {{ xp: number, level: number, levelLabel: string }} result
   * @returns {HTMLElement}
   */
  function _buildLevelCard({ xp, level, levelLabel }) {
    const card = doc.createElement('div');
    card.className = 'card rpg-level-card';

    const head = doc.createElement('div');
    head.className = 'rpg-level-card__head';

    const badge = doc.createElement('div');
    badge.className = 'rpg-level-badge';
    const badgeCaption = doc.createElement('span');
    badgeCaption.className = 'rpg-level-badge__caption';
    badgeCaption.textContent = 'LVL';
    const badgeNumber = doc.createElement('span');
    badgeNumber.className = 'rpg-level-badge__number';
    badgeNumber.textContent = String(level);
    badge.append(badgeCaption, badgeNumber);
    badge.setAttribute('aria-label', `Level ${level}`);

    const titles = doc.createElement('div');
    titles.className = 'rpg-level-card__titles';
    // Rank label (includes "(MAX)" suffix when applicable)
    const rankLabel = doc.createElement('h2');
    rankLabel.className = 'rpg-level-card__rank';
    rankLabel.textContent = levelLabel;
    const status = doc.createElement('p');
    status.className = 'rpg-level-card__status';
    status.textContent = level >= MAX_LEVEL ? 'Max rank reached' : `Level ${level} · next at ${(10 * level ** 2).toLocaleString('en-US')} XP`;
    titles.append(rankLabel, status);

    head.append(badge, titles);
    card.appendChild(head);

    // Progress bar
    card.appendChild(_buildProgressBar(xp, level));

    // XP total
    const xpEl = doc.createElement('p');
    xpEl.className = 'rpg-level-card__xp';
    xpEl.textContent = `${Number(xp).toLocaleString('en-US')} XP · 1 XP per 100 steps`;
    card.appendChild(xpEl);

    return card;
  }

  /**
   * "Trophies" heading with the earned count.
   * @param {object} achievements
   * @returns {HTMLElement}
   */
  function _buildTrophyHeader(achievements) {
    const header = doc.createElement('div');
    header.className = 'section-head';
    const title = doc.createElement('h2');
    title.className = 'section-title';
    title.textContent = 'Trophies';
    const count = doc.createElement('span');
    count.className = 'section-head__meta';
    const earned = TROPHY_DEFINITIONS.filter((def) => achievements?.[def.key]).length;
    count.textContent = `${earned} of ${TROPHY_DEFINITIONS.length} earned`;
    header.append(title, count);
    return header;
  }

  /**
   * Builds the progress bar for xp progress toward the next level.
   *
   * levelFloor    = 10 * (level - 1)^2
   * nextLevelFloor = 10 * level^2
   * At MAX (level 50) the bar is clamped to 100%.
   *
   * @param {number} xp
   * @param {number} level - capped 1–50
   * @returns {HTMLElement}
   */
  function _buildProgressBar(xp, level) {
    const track = doc.createElement('div');
    track.className = 'rpg-progress-bar';

    const inner = doc.createElement('div');
    inner.className = 'rpg-progress-bar__fill';
    inner.style.width = _computeProgressWidth(xp, level);

    track.appendChild(inner);
    return track;
  }

  /**
   * Computes the CSS width string for the progress bar fill.
   *
   * @param {number} xp
   * @param {number} level - capped 1–50
   * @returns {string} e.g. "42.7%"
   */
  function _computeProgressWidth(xp, level) {
    const levelFloor = 10 * (level - 1) ** 2;
    const nextLevelFloor = 10 * level ** 2;

    // At MAX level the denominator would be (10*50^2 - 10*49^2); clamp to 100%
    if (level >= 50) return '100.0%';

    const range = nextLevelFloor - levelFloor;
    if (range <= 0) return '100.0%';

    const pct = ((xp - levelFloor) / range) * 100;
    const clamped = Math.min(Math.max(pct, 0), 100);
    return `${clamped.toFixed(1)}%`;
  }

  /**
   * Builds the trophy case grid.
   *
   * @param {{ centurion: boolean, marathoner: boolean, unstoppable: boolean, nightOwl: boolean }} achievements
   * @returns {HTMLElement}
   */
  function _buildTrophyGrid(achievements) {
    const grid = doc.createElement('div');
    grid.className = 'trophy-grid';

    for (const def of TROPHY_DEFINITIONS) {
      grid.appendChild(_buildTrophyCard(def, achievements[def.key]));
    }

    return grid;
  }

  /**
   * Builds a single trophy card tile.
   *
   * @param {{ key: string, icon: string, title: string, description: string }} def
   * @param {boolean} unlocked
   * @returns {HTMLElement}
   */
  function _buildTrophyCard(def, unlocked) {
    const card = doc.createElement('div');
    card.className = unlocked ? 'trophy-card' : 'trophy-card trophy-card--locked';

    const iconEl = doc.createElement('span');
    iconEl.className = 'trophy-card__icon';
    iconEl.appendChild(createIcon(doc, def.icon, { size: 22 }));
    card.appendChild(iconEl);

    const titleEl = doc.createElement('h3');
    titleEl.className = 'trophy-card__title';
    titleEl.textContent = def.title;
    card.appendChild(titleEl);

    const descEl = doc.createElement('p');
    descEl.className = 'trophy-card__desc';
    descEl.textContent = def.description;
    card.appendChild(descEl);

    const state = doc.createElement('span');
    state.className = unlocked ? 'trophy-card__state trophy-card__state--earned' : 'trophy-card__state';
    state.textContent = unlocked ? 'Earned' : 'Locked';
    card.appendChild(state);

    return card;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Resolves the gamification container.
   * Prefers #lab-gamification on the Journey screen.
   * Falls back to creating a div inside #tab-journey.
   * Returns null only when #tab-journey is also absent.
   *
   * @returns {HTMLElement|null}
   */
  function _resolveContainer() {
    const existing = doc.getElementById('lab-gamification');
    if (existing) return existing;

    const tabLab = doc.getElementById('tab-journey');
    if (!tabLab) return null;

    // Create a fallback container
    const fallback = doc.createElement('div');
    fallback.id = 'lab-gamification';
    tabLab.appendChild(fallback);
    return fallback;
  }

  return { render };
}
