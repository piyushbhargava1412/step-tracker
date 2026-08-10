import Dexie from 'dexie';

export const DB_NAME = 'StepTrackerDB';
export const DB_VERSION = 2;

/**
 * Local-time YYYY-MM-DD formatter (mirrors the _localDate convention in goal.js).
 * Uses getFullYear/getMonth/getDate — never toISOString() — so dates are timezone-safe.
 */
function _localDate(ms = Date.now()) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${MM}-${dd}`;
}

export function createDb() {
  const db = new Dexie(DB_NAME);
  db.version(DB_VERSION)
    .stores({
      daily_records: 'date,effective_steps,effective_distance_km,is_overridden,synced_at',
      settings: 'key',
      goal_history: 'effective_from,target_distance_km,target_steps',
    })
    .upgrade(async (tx) => {
      try {
        const row = await tx.table('settings').get('active_goal');
        const valid =
          row &&
          typeof row === 'object' &&
          Number.isFinite(row.target_distance_km) &&
          row.target_distance_km > 0 &&
          Number.isFinite(row.target_steps) &&
          row.target_steps > 0;
        if (!valid) return;
        await tx.table('goal_history').put({
          effective_from: row.effective_from ?? _localDate(),
          target_distance_km: row.target_distance_km,
          target_steps: row.target_steps,
        });
      } catch (err) {
        // Never rethrow — a throwing upgrade blocks db.open()
        console.error('[db]', err);
      }
    });
  return db;
}

export async function initDB(db, reporter) {
  try {
    await db.open();
    const count = await db.daily_records.count();
    reporter.db(`✅ DB ready (${count} records)`);
  } catch (err) {
    console.error('[initDB] Failed to open StepTrackerDB', err);
    reporter.db('❌ DB init failed');
  }
}
