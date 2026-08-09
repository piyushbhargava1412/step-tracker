import Dexie from 'dexie';

export const DB_NAME = 'StepTrackerDB';
export const DB_VERSION = 1;

export function createDb() {
  const db = new Dexie(DB_NAME);
  db.version(DB_VERSION).stores({
    daily_records: 'date,effective_steps,effective_distance_km,is_overridden,synced_at',
    settings: 'key',
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
