export const SYNC_ANCHOR_KEY = 'sync_anchor_date';
export const DEFAULT_SYNC_ANCHOR = '2018-01-01';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(dateStr) {
  if (typeof dateStr !== 'string' || !DATE_REGEX.test(dateStr)) return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

export function createSettings(db) {
  async function getSyncAnchorDate() {
    try {
      const row = await db.settings.get(SYNC_ANCHOR_KEY);
      if (row == null || !row.value) return DEFAULT_SYNC_ANCHOR;
      return row.value;
    } catch (err) {
      console.error('[settings]', err);
      return DEFAULT_SYNC_ANCHOR;
    }
  }

  async function setSyncAnchorDate(date) {
    if (!isValidDate(date)) {
      throw new TypeError(`Invalid sync anchor date: ${date}. Expected strict YYYY-MM-DD.`);
    }
    await db.settings.put({ key: SYNC_ANCHOR_KEY, value: date, updated_at: new Date().toISOString() });
  }

  return { getSyncAnchorDate, setSyncAnchorDate };
}
