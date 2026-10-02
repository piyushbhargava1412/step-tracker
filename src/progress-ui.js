/**
 * Today screen — progress panel render layer.
 *
 * Renders into #today-progress: the panel heading with the goal chip (the step
 * goal selector), a progress ring holding today's steps / goal / percentage,
 * and either "N steps to go" or "Goal met". Also fills the Distance tile
 * (#tile-distance) of the panel's stat grid; streak-ui.js fills the others.
 *
 * Idempotent: each render replaces the mount's content.
 * Fail-open: render() never throws or rejects; failures log + render zero-state.
 *
 * Dependencies are injected — no direct document/Dexie imports.
 */

import { getTodayRecord, computeProgress } from './progress.js';
import { STEP_GOAL_KM_HINTS, STEP_GOAL_OPTIONS } from './goal.js';
import { fillStatTile } from './stat-tile.js';
import { keepTextFitted } from './fit-text.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
// A thin stroke leaves 210px inside the ring — room for a six-digit day
// (999,999). CSS scales the ring down on narrow screens (viewBox geometry).
export const RING_SIZE = 236;
export const RING_RADIUS = 110;
export const RING_STROKE = 10;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const GOAL_SAVE_ERROR = '⚠️ Failed to save goal — please try again';

/** 8500 → "8.5k", 10000 → "10k". */
function _compactThousands(steps) {
  const thousands = steps / 1000;
  return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`;
}

/** Goal chip option text: "Goal 10k · ~8 km". */
export function _goalOptionLabel(steps) {
  const km = STEP_GOAL_KM_HINTS[steps];
  return km ? `Goal ${_compactThousands(steps)} · ~${km} km` : `Goal ${_compactThousands(steps)}`;
}

/**
 * @param {Document} doc
 * @param {{ getActiveStepGoal: Function, setActiveStepGoal: Function }} goal
 * @param {object} db
 * @param {{ db: Function }} reporter
 * @param {Function} [onGoalApplied]  invoked after a goal change is saved and re-rendered
 * @param {{ canEdit?: boolean, onGoalMet?: Function }} [options]  canEdit false (ST-023,
 *   the read-only web viewer) shows the goal chip disabled; onGoalMet runs after
 *   a render that shows the goal met (ST-029, the goal celebration).
 * @returns {{ render: Function }}
 */
export function createProgressUI(doc, goal, db, reporter, onGoalApplied = () => {}, { canEdit = true, onGoalMet = () => {} } = {}) {
  // Stops fitting the previous render's step count (its node is replaced).
  let stopFittingSteps = () => {};

  function _el(tag, className, textContent) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (textContent !== undefined) node.textContent = textContent;
    return node;
  }

  function _svg(tag, attrs) {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  }

  function _buildHead(progress) {
    const head = _el('div', 'today-head');
    head.appendChild(_el('span', 'label', "Today's progress"));

    const chip = _el('label', 'goal-chip');
    const select = _el('select', 'goal-select');
    select.id = 'goal-select';
    select.setAttribute('aria-label', 'Daily step goal');
    for (const steps of STEP_GOAL_OPTIONS) {
      const option = _el('option', '', _goalOptionLabel(steps));
      option.value = String(steps);
      select.appendChild(option);
    }
    select.value = String(progress.target_steps);
    select.disabled = !canEdit;
    select.addEventListener('change', (event) => _onGoalChange(event));
    chip.appendChild(select);
    head.appendChild(chip);
    return head;
  }

  function _buildRing({ steps, target_steps, pct, goalMet }) {
    const ring = _el('div', 'ring');
    ring.setAttribute('role', 'progressbar');
    ring.setAttribute('aria-label', "Today's steps toward your goal");
    ring.setAttribute('aria-valuenow', String(pct));
    ring.setAttribute('aria-valuemin', '0');
    ring.setAttribute('aria-valuemax', '100');

    const center = RING_SIZE / 2;
    const svg = _svg('svg', {
      class: 'ring__svg',
      width: RING_SIZE,
      height: RING_SIZE,
      viewBox: `0 0 ${RING_SIZE} ${RING_SIZE}`,
      'aria-hidden': 'true',
    });
    svg.appendChild(_svg('circle', {
      class: 'ring__track', cx: center, cy: center, r: RING_RADIUS, fill: 'none', 'stroke-width': RING_STROKE,
    }));
    const arc = (pct / 100) * RING_CIRCUMFERENCE;
    svg.appendChild(_svg('circle', {
      class: goalMet ? 'ring__fill ring__fill--full' : 'ring__fill',
      cx: center,
      cy: center,
      r: RING_RADIUS,
      fill: 'none',
      'stroke-width': RING_STROKE,
      'stroke-linecap': 'round',
      'stroke-dasharray': `${arc.toFixed(1)} ${RING_CIRCUMFERENCE.toFixed(1)}`,
      transform: `rotate(-90 ${center} ${center})`,
    }));
    ring.appendChild(svg);

    const middle = _el('div', 'ring__center');
    const stepCount = _el('span', 'ring__steps', steps.toLocaleString('en-US'));
    middle.append(
      stepCount,
      _el('span', 'ring__goal', `of ${target_steps.toLocaleString('en-US')} steps`),
      _el('span', 'ring__pct', `${pct}%`),
    );
    ring.appendChild(middle);
    // Large counts at a large system font size would spill past the ring.
    stopFittingSteps();
    stopFittingSteps = keepTextFitted(stepCount, middle);
    return ring;
  }

  function _fillDistanceTile(distanceKm) {
    const tile = doc.getElementById('tile-distance');
    if (!tile) return;
    fillStatTile(doc, tile, { label: 'Distance', num: distanceKm.toFixed(1), unit: 'km', sub: 'today' });
  }

  /**
   * Render (or re-render) the progress panel. Never throws or rejects.
   * @returns {Promise<void>}
   */
  async function render() {
    const mount = doc.getElementById('today-progress');
    if (!mount) {
      console.warn('[progress]', 'Missing #today-progress — skipping render');
      return;
    }

    let progress;
    try {
      const [todayRecord, activeStepGoal] = await Promise.all([
        getTodayRecord(db),
        goal.getActiveStepGoal(),
      ]);
      progress = computeProgress(todayRecord, activeStepGoal);
    } catch (err) {
      console.error('[progress]', err);
      reporter.db('❌ Progress load failed');
      progress = computeProgress(null, null);
    }

    const status = progress.goalMet
      ? _el('p', 'goal-met-badge', 'Goal met')
      : _el('p', 'remaining-hint', `${progress.remaining_steps.toLocaleString('en-US')} steps to go`);
    const error = _el('span', 'goal-error');
    error.id = 'goal-error';
    error.setAttribute('role', 'alert');

    // A fresh <select> per render replaces the old one, so stale change
    // listeners go with it.
    mount.replaceChildren(_buildHead(progress), _buildRing(progress), status, error);
    _fillDistanceTile(progress.distance_km);
    if (progress.goalMet) {
      try { onGoalMet(); } catch (err) { console.error('[progress]', err); }
    }
  }

  async function _onGoalChange(event) {
    try {
      await goal.setActiveStepGoal(Number(event.target.value));
      await render();
      try { onGoalApplied(); } catch (err) { console.error('[progress]', err); }
    } catch (_err) {
      const errEl = doc.getElementById('goal-error');
      if (errEl) errEl.textContent = GOAL_SAVE_ERROR;
    }
  }

  return { render };
}
