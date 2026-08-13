import { vi } from 'vitest';

/**
 * Shared test fixtures for the step-sync engine tests.
 *
 * Hoisted out of the Task 9 / Task 10 describes (which copy-pasted the same
 * block) so a fixture change is made in exactly one place.
 */

/**
 * Build a stateful in-memory Dexie double. orderBy('date').first()/.last()
 * sort the live row Map; bulkPut writes into it; settings is a Map-backed
 * store; transaction executes its callback.
 *
 * @param {object}  opts
 * @param {Array=}  opts.seed   Initial daily_records rows ({ date, ... }).
 * @param {*=}      opts.flag   Value the settings.get/put latch pair reads/writes.
 */
export function makeStatefulDb({ seed = [], flag = undefined, syncAnchor = undefined } = {}) {
  const rows = new Map(seed.map((r) => [r.date, r]));
  let flagValue = flag;
  const anchorValue = syncAnchor;
  const sortAsc = () =>
    [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    settings: {
      get: vi.fn(async (key) => {
        if (key === 'sync_anchor_date') {
          return anchorValue === undefined ? undefined : { key, value: anchorValue };
        }
        return flagValue === undefined ? undefined : { key, value: flagValue };
      }),
      put: vi.fn(async (row) => {
        flagValue = row.value;
      }),
    },
    daily_records: {
      orderBy: vi.fn(() => ({
        first: vi.fn(async () => sortAsc()[0]),
        last: vi.fn(async () => {
          const sorted = sortAsc();
          return sorted[sorted.length - 1];
        }),
      })),
      bulkGet: vi.fn(async (dates) => dates.map((d) => rows.get(d))),
      bulkPut: vi.fn(async (records) => {
        for (const r of records) rows.set(r.date, r);
      }),
    },
    transaction: vi.fn(async (_mode, _table, callback) => callback()),
    _rows: rows,
  };
}

/**
 * Build a scripted Dexie double. orderBy('date').first() returns firstSeq[i]
 * for the i-th invocation (window resolution, latch re-read, final message
 * read); last() always returns latestValue.
 *
 * @param {object}  opts
 * @param {Array=}  opts.firstSeq      Values first() resolves, in call order.
 * @param {*=}      opts.latestValue   Value last() always resolves.
 * @param {*=}      opts.flagRow       Row settings.get always resolves.
 */
export function makeScriptedDb({ firstSeq, latestValue, flagRow, anchorRow } = {}) {
  const first = vi.fn();
  for (const value of firstSeq) first.mockResolvedValueOnce(value);
  first.mockResolvedValue(firstSeq[firstSeq.length - 1]);
  return {
    settings: {
      get: vi.fn((key) => {
        if (key === 'sync_anchor_date') return Promise.resolve(anchorRow);
        return Promise.resolve(flagRow);
      }),
      put: vi.fn().mockResolvedValue(undefined),
    },
    daily_records: {
      orderBy: vi.fn().mockReturnValue({
        first,
        last: vi.fn().mockResolvedValue(latestValue),
      }),
      bulkGet: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn().mockResolvedValue(undefined),
    },
    transaction: vi.fn(async (_mode, _table, callback) => callback()),
  };
}

/**
 * A full-shaped row for seeding the stateful double.
 *
 * @param {string} date  Local YYYY-MM-DD primary key.
 */
export function seedRow(date) {
  return {
    date,
    original_steps: 100,
    original_distance_km: 0.08,
    effective_steps: 100,
    effective_distance_km: 0.08,
    is_overridden: false,
    override: null,
    synced_at: '2025-01-01T00:00:00.000Z',
  };
}

/**
 * The live #sync-btn element injected into the jsdom document.
 *
 * @param {Document=} doc  Test document (defaults to the global jsdom document).
 */
export function syncBtn(doc = document) {
  return doc.getElementById('sync-btn');
}

/**
 * The last reporter.sync() message emitted, or undefined when none.
 *
 * @param {object} reporter  A reporter whose sync channel is a vi.fn().
 */
export function lastSyncMessage(reporter) {
  const calls = reporter.sync.mock.calls;
  return calls.length ? calls[calls.length - 1][0] : undefined;
}
