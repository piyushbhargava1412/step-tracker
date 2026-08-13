import { _localDate } from './date-utils.js';

export const CSV_HEADERS =
  'Date,Original_Steps,Original_Distance_KM,Effective_Steps,Effective_Distance_KM,Is_Overridden';

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
  };
}

/**
 * RFC-4180 minimal quoting: wraps value in double quotes and doubles any embedded
 * double-quotes iff the stringified value contains , " \n or \r, or starts with a
 * formula-injection trigger character (= + - @) per OWASP CSV injection guidance.
 * Booleans and numbers are rendered plainly.
 *
 * @param {*} value
 * @returns {string}
 */
export function _csvCell(value) {
  const str = String(value);
  if (/[,"\n\r]/.test(str) || /^[=+\-@]/.test(str)) {
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
 * Builds the export filename: step-tracker-export-YYYY-MM-DD.<ext>
 * Uses _localDate() (timezone-safe) — never the UTC-biased Date#toISOString (Decision 10).
 *
 * @param {string} ext - file extension without leading dot
 * @returns {string}
 */
function _filename(ext) {
  return EXPORT_FILENAME_PREFIX + _localDate() + '.' + ext;
}

/**
 * Factory — returns exportCsv and exportJson bound to the injected document.
 * All browser APIs (Blob, URL.createObjectURL/revokeObjectURL, anchor click)
 * are confined to _triggerDownload so tests can stub them via vi.stubGlobal
 * and an injected doc spy (Decision 3).
 *
 * @param {Document} doc - injected document for browser-API isolation
 * @returns {{ exportCsv: Function, exportJson: Function }}
 */
export function createExporter(doc) {
  /**
   * Creates a temporary object URL, triggers a download via an anchor click,
   * then revokes the URL in a finally block (no memory leak).
   * Any error is caught and logged; never rethrows.
   *
   * @param {string} filename
   * @param {string} mimeType
   * @param {string} text
   */
  function _triggerDownload(filename, mimeType, text) {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    try {
      const a = doc.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    } catch (err) {
      console.error('[exporter]', err);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function exportCsv(records) {
    _triggerDownload(_filename('csv'), 'text/csv', _toCsv(records));
  }

  function exportJson(records) {
    _triggerDownload(_filename('json'), 'application/json', _toJson(records));
  }

  return { exportCsv, exportJson };
}
