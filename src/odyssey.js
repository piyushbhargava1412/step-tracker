/**
 * odyssey.js — Pure virtual expedition engine.
 *
 * No DOM symbols, no Dexie imports. All exports are pure data/functions.
 */

// ── City catalogue ────────────────────────────────────────────────────────────

/** @type {{ name: string, country: string, lat: number, lng: number }[]} */
export const HOME_BASE_CITIES = [
  { name: 'Hyderabad', country: 'India',          lat: 17.3850,  lng:  78.4867 },
  { name: 'Goa',       country: 'India',          lat: 15.2993,  lng:  74.1240 },
  { name: 'Mumbai',    country: 'India',          lat: 19.0760,  lng:  72.8777 },
  { name: 'New Delhi', country: 'India',          lat: 28.6139,  lng:  77.2090 },
  { name: 'Dubai',     country: 'UAE',            lat: 25.2048,  lng:  55.2708 },
  { name: 'London',    country: 'United Kingdom', lat: 51.5074,  lng:  -0.1278 },
  { name: 'New York',  country: 'USA',            lat: 40.7128,  lng: -74.0060 },
];

// ── Milestone waypoints ───────────────────────────────────────────────────────

/** Cumulative km from Hyderabad to each destination.
 * @type {{ destination: string, distanceKm: number }[]} */
export const MILESTONES = [
  { destination: 'Goa',      distanceKm:   650 },
  { destination: 'Mumbai',   distanceKm:   710 },
  { destination: 'New Delhi', distanceKm: 1580 },
  { destination: 'Dubai',    distanceKm:  2890 },
  { destination: 'London',   distanceKm:  7700 },
  { destination: 'New York', distanceKm: 12500 },
];

// ── Zero-state factory ────────────────────────────────────────────────────────

/** Returns the zero-state (used for invalid / empty input). */
const _zeroState = () => ({
  unlockedLegs: [],
  activeLeg:    MILESTONES[0],
  progressPct:  0,
  remainingKm:  MILESTONES[0].distanceKm,
});

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * Compute the odyssey progress for a given cumulative distance.
 *
 * @param {number} totalDistanceKm - Total steps converted to km.
 * @returns {{
 *   unlockedLegs: typeof MILESTONES,
 *   activeLeg: (typeof MILESTONES[number]) | undefined,
 *   progressPct: number,
 *   remainingKm: number,
 * }}
 */
export function computeOdysseyProgress(totalDistanceKm) {
  // Guard: non-finite or negative → zero-state
  if (!Number.isFinite(totalDistanceKm) || totalDistanceKm < 0) {
    return _zeroState();
  }

  const unlockedLegs = MILESTONES.filter(leg => totalDistanceKm >= leg.distanceKm);
  const activeLeg    = MILESTONES.find(leg  => totalDistanceKm < leg.distanceKm);

  // All legs complete
  if (activeLeg === undefined) {
    return { unlockedLegs, activeLeg: undefined, progressPct: 100, remainingKm: 0 };
  }

  // Previous cumulative distance (0 if we haven't passed any milestone yet)
  const activeIndex    = MILESTONES.indexOf(activeLeg);
  const previousLegKm  = activeIndex === 0 ? 0 : MILESTONES[activeIndex - 1].distanceKm;

  const legSpan       = activeLeg.distanceKm - previousLegKm;
  const travelled     = totalDistanceKm - previousLegKm;
  const progressPct   = Math.min(100, Math.max(0, (travelled / legSpan) * 100));
  const remainingKm   = activeLeg.distanceKm - totalDistanceKm;

  return { unlockedLegs, activeLeg, progressPct, remainingKm };
}
