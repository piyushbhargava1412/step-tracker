import {
  buildEffectiveGoalHistory,
  _prepareGoalHistory,
  _resolvePreparedGoalForDate,
} from './goal-history.js';

export function createSearch(db, goal) {
  async function executeQuery(filters) {
    const f = filters != null ? filters : {};
    try {
      const hasRange =
        typeof f.startDate === 'string' &&
        f.startDate !== '' &&
        typeof f.endDate === 'string' &&
        f.endDate !== '';

      const raw = hasRange
        ? await db.daily_records.where('date').between(f.startDate, f.endDate, true, true)
        : await db.daily_records.toArray();

      const history = await db.goal_history.toArray();
      const activeGoal = await goal.getActiveGoal();
      const effectiveHistory = buildEffectiveGoalHistory(history, activeGoal);
      const prepared = _prepareGoalHistory(effectiveHistory);

      const minSteps = Number.isFinite(f.minSteps) ? f.minSteps : null;
      const maxSteps = Number.isFinite(f.maxSteps) ? f.maxSteps : null;
      const minDistance = Number.isFinite(f.minDistance) ? f.minDistance : null;
      const overrideStatus = f.overrideStatus ?? 'all';
      const targetOutcome = f.targetOutcome ?? 'all';

      const result = raw.filter((record) => {
        if (minSteps !== null && record.effective_steps < minSteps) return false;
        if (maxSteps !== null && record.effective_steps > maxSteps) return false;
        if (minDistance !== null && record.effective_distance_km < minDistance) return false;
        if (overrideStatus === 'overridden' && record.is_overridden !== true) return false;
        if (overrideStatus === 'not-overridden' && record.is_overridden !== false) return false;
        if (targetOutcome === 'met') {
          if (
            !Number.isFinite(record.effective_distance_km) ||
            record.effective_distance_km < _resolvePreparedGoalForDate(prepared, record.date)
          )
            return false;
        }
        if (targetOutcome === 'missed') {
          if (!Number.isFinite(record.effective_distance_km)) return false;
          if (
            record.effective_distance_km >=
            _resolvePreparedGoalForDate(prepared, record.date)
          )
            return false;
        }
        return true;
      });

      return result.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
    } catch (err) {
      console.error('[search]', err);
      return [];
    }
  }

  function computeResultSummary(_records, _filters) {
    return null;
  }

  return { executeQuery, computeResultSummary };
}
