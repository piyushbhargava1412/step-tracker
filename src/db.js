import Dexie from 'dexie';
import { _localDate } from './date-utils.js';

export const DB_NAME = 'StepTrackerDB';
export const DB_VERSION = 4;

const DAILY_RECORDS_STORES = 'date,effective_steps,effective_distance_km,is_overridden,synced_at';
const SETTINGS_STORES = 'key';
const GOAL_HISTORY_STORES = 'effective_from,target_distance_km,target_steps';

export function createDb() {
  const db = new Dexie(DB_NAME);

  // v2: migrate goal settings to goal_history table
  db.version(2)
    .stores({
      daily_records: DAILY_RECORDS_STORES,
      settings: SETTINGS_STORES,
      goal_history: GOAL_HISTORY_STORES,
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

  // v3: backfill effective_* / is_overridden / override for legacy daily_records rows
  db.version(3)
    .stores({
      daily_records: DAILY_RECORDS_STORES,
      settings: SETTINGS_STORES,
      goal_history: GOAL_HISTORY_STORES,
    })
    .upgrade(async (tx) => {
      try {
        await tx.table('daily_records').toCollection().each((row, cursor) => {
          // Idempotent: only touch rows that are missing the new fields
          if (
            row.effective_steps !== undefined &&
            row.effective_distance_km !== undefined &&
            row.is_overridden !== undefined &&
            row.override !== undefined
          ) {
            return;
          }
          cursor.modify({
            effective_steps: row.original_steps,
            effective_distance_km: row.original_distance_km,
            is_overridden: false,
            override: null,
          });
        });
      } catch (err) {
        // Never rethrow — a throwing upgrade blocks db.open()
        console.error('[db]', err);
      }
    });

  // v4: drop goal_history table; seed active_step_goal in settings
  // The legacy km goal is NOT converted — reset to 10000 (SF-3 Option A, owner-confirmed).
  db.version(4)
    .stores({
      daily_records: DAILY_RECORDS_STORES,
      settings: SETTINGS_STORES,
      goal_history: null, // drop the table
    })
    .upgrade(async (tx) => {
      try {
        const settings = tx.table('settings');
        await settings.delete('active_goal');
        await settings.put({ key: 'active_step_goal', target_steps: 10000 });
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
