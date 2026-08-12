export const NEAR_MISS_BAND_PCT = 10;

export function createSearch(db) {
  async function executeQuery(filters) {
    const f = filters != null ? filters : {};
    const hasRange =
      typeof f.startDate === 'string' &&
      f.startDate !== '' &&
      typeof f.endDate === 'string' &&
      f.endDate !== '';

    const raw = hasRange
      ? await db.daily_records.where('date').between(f.startDate, f.endDate, true, true).toArray()
      : await db.daily_records.toArray();

    const minSteps = Number.isFinite(f.minSteps) ? f.minSteps : null;
    const maxSteps = Number.isFinite(f.maxSteps) ? f.maxSteps : null;
    const overrideStatus = f.overrideStatus ?? 'all';
    const targetOutcome = f.targetOutcome ?? 'all';
    const stepTarget = Number.isFinite(f.stepTarget) && f.stepTarget > 0 ? f.stepTarget : null;

    const records = raw.filter((record) => {
      if (minSteps !== null && record.effective_steps < minSteps) return false;
      if (maxSteps !== null && record.effective_steps > maxSteps) return false;
      if (overrideStatus === 'overridden' && record.is_overridden !== true) return false;
      if (overrideStatus === 'not-overridden' && record.is_overridden !== false) return false;
      if (targetOutcome === 'met' && stepTarget !== null) {
        if (!Number.isFinite(record.effective_steps)) return false;
        if (record.effective_steps < stepTarget) return false;
      }
      if (targetOutcome === 'missed' && stepTarget !== null) {
        if (!Number.isFinite(record.effective_steps)) return false;
        if (record.effective_steps >= stepTarget) return false;
      }
      return true;
    });

    return {
      records: records.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0)),
      preFilterSet: raw,
    };
  }

  function computeResultSummary(records, preFilterSet) {
    const totalDays = preFilterSet.length;
    const count = records.length;
    const matchPct = totalDays === 0 ? null : Math.round((count / totalDays) * 100);
    if (count === 0) {
      return { count: 0, matchPct: null, totalDays, cumulativeDistanceKm: 0, avgSteps: null };
    }
    let sumDistance = 0;
    let sumSteps = 0;
    for (const r of records) {
      sumDistance += Number.isFinite(r.effective_distance_km) ? r.effective_distance_km : 0;
      sumSteps += r.effective_steps;
    }
    return {
      count,
      matchPct,
      totalDays,
      cumulativeDistanceKm: sumDistance,
      avgSteps: Math.round(sumSteps / count),
    };
  }

  return { executeQuery, computeResultSummary };
}

export function computeNearMisses(records, stepTarget) {
  if (!Array.isArray(records)) return { count: 0, days: [] };
  if (!Number.isFinite(stepTarget) || stepTarget <= 0) return { count: 0, days: [] };

  const lowerBound = stepTarget * (1 - NEAR_MISS_BAND_PCT / 100);

  const days = records
    .filter((record) => {
      const steps = Number.isFinite(record.effective_steps) ? record.effective_steps : 0;
      return steps >= lowerBound && steps < stepTarget;
    })
    .map((record) => ({
      date: record.date,
      effective_steps: record.effective_steps,
      shortfall: stepTarget - record.effective_steps,
    }))
    .sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));

  return { count: days.length, days };
}
