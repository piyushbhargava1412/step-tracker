/**
 * gamification-ui.js — DOM renderer for the RPG level card and trophy case.
 *
 * Pairs with gamification.js (pure engine). This module owns all DOM writes for
 * the gamification section in #tab-lab (#lab-gamification).
 *
 * Architecture constraints:
 * - No Dexie imports; all data arrives via engine.compute().
 * - No innerHTML for user-supplied strings (XSS guard).
 * - AbortController per render() call — prevents listener accumulation.
 * - replaceChildren() for idempotent re-renders.
 * - Fail-open: errors from engine are caught, reporter.db() notified.
 *
 * SF-1:  Pure CSS <div> bars only — no SVG, no charting library.
 * SF-11: Level cap at 50 with "(MAX)" suffix; progress bar clamped to 100%.
 * SF-13: render() catch → console.error + reporter.db + error <p>.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const TROPHY_DEFINITIONS = [
  {
    key: 'centurion',
    emoji: '🏆',
    title: 'Centurion',
    description: 'Walk 100,000+ steps in a single ISO week',
  },
  {
    key: 'marathoner',
    emoji: '🦸',
    title: 'Marathoner',
    description: 'Walk 55,000+ steps in a single day',
  },
  {
    key: 'unstoppable',
    emoji: '🔥',
    title: 'Unstoppable',
    description: 'Maintain a 30-day step streak',
  },
  {
    key: 'nightOwl',
    emoji: '🦉',
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
      const nodes = [
        _buildLevelCard(result),
        _buildTrophyGrid(result.achievements),
      ];
      container.replaceChildren(...nodes);
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
    card.className = 'rpg-level-card';

    // Level number
    const levelNum = doc.createElement('p');
    levelNum.textContent = `Level ${level}`;
    card.appendChild(levelNum);

    // Rank label (includes "(MAX)" suffix when applicable)
    const rankLabel = doc.createElement('h2');
    rankLabel.textContent = levelLabel;
    card.appendChild(rankLabel);

    // XP total
    const xpEl = doc.createElement('p');
    xpEl.textContent = `${xp} XP`;
    card.appendChild(xpEl);

    // Progress bar
    card.appendChild(_buildProgressBar(xp, level));

    return card;
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
   * @param {{ key: string, emoji: string, title: string, description: string }} def
   * @param {boolean} unlocked
   * @returns {HTMLElement}
   */
  function _buildTrophyCard(def, unlocked) {
    const card = doc.createElement('div');
    card.className = unlocked ? 'trophy-card' : 'trophy-card trophy-card--locked';

    const emojiEl = doc.createElement('span');
    emojiEl.textContent = def.emoji;
    card.appendChild(emojiEl);

    const titleEl = doc.createElement('h3');
    titleEl.textContent = def.title;
    card.appendChild(titleEl);

    const descEl = doc.createElement('p');
    descEl.textContent = def.description;
    card.appendChild(descEl);

    return card;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Resolves the gamification container.
   * Prefers #lab-gamification inside #tab-lab.
   * Falls back to creating a div inside #tab-lab.
   * Returns null only when #tab-lab is also absent.
   *
   * @returns {HTMLElement|null}
   */
  function _resolveContainer() {
    const existing = doc.getElementById('lab-gamification');
    if (existing) return existing;

    const tabLab = doc.getElementById('tab-lab');
    if (!tabLab) return null;

    // Create a fallback container
    const fallback = doc.createElement('div');
    fallback.id = 'lab-gamification';
    tabLab.appendChild(fallback);
    return fallback;
  }

  return { render };
}
