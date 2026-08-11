export const CSV_HEADERS =
  'Date,Original_Steps,Original_Distance_KM,Effective_Steps,Effective_Distance_KM,Is_Overridden,Override_Note';

export const EXPORT_FILENAME_PREFIX = 'step-tracker-export-';

/**
 * Maps a daily_records row to a flat export object keyed by the CSV header names.
 * Feeds both _toCsv and _toJson so the two formats never drift.
 *
 * @param {object} record
 * @returns {object}
 */
export function _toExportRow(record) {
  return {
    Date: record.date,
    Original_Steps: record.original_steps,
    Original_Distance_KM: record.original_distance_km,
    Effective_Steps: record.effective_steps,
    Effective_Distance_KM: record.effective_distance_km,
    Is_Overridden: record.is_overridden === true,
    Override_Note: record.override?.note ?? '',
  };
}

/**
 * RFC-4180 minimal quoting: wraps value in double quotes and doubles any embedded
 * double-quotes iff the stringified value contains , " \n or \r.
 * Booleans and numbers are rendered plainly.
 *
 * @param {*} value
 * @returns {string}
 */
export function _csvCell(value) {
  const str = String(value);
  if (/[,"\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Serialises an array of daily_records to RFC-4180 CSV.
 * First line is CSV_HEADERS; each subsequent line is a record row joined by \r\n.
 *
 * @param {object[]} records
 * @returns {string}
 */
export function _toCsv(records) {
  if (records.length === 0) return CSV_HEADERS;
  const headerKeys = CSV_HEADERS.split(',');
  const rows = records.map(record => {
    const row = _toExportRow(record);
    return headerKeys.map(key => _csvCell(row[key])).join(',');
  });
  return CSV_HEADERS + '\r\n' + rows.join('\r\n');
}

/**
 * Serialises an array of daily_records to a pretty-printed JSON array.
 * Keys mirror the CSV headers exactly (Decision 2).
 *
 * @param {object[]} records
 * @returns {string}
 */
export function _toJson(records) {
  return JSON.stringify(records.map(_toExportRow), null, 2);
}

/**
 * Factory — returns exportCsv and exportJson methods.
 * The download seam (Task 2) will be added in the next task.
 *
 * @param {Document} doc - injected document for browser-API isolation
 * @returns {{ exportCsv: Function, exportJson: Function }}
 */
export function createExporter(doc) {
  function exportCsv(records) {
    // Task 2: download seam to be added
  }

  function exportJson(records) {
    // Task 2: download seam to be added
  }

  return { exportCsv, exportJson };
}
