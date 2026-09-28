import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  CSV_HEADERS,
  EXPORT_FILENAME_PREFIX,
  _toExportRow,
  _csvCell,
  _toCsv,
  _toJson,
  createExporter,
} from './exporter.js';
import { _localDate } from './date-utils.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createExporter — serialisers', () => {
  // --- _toExportRow ---
  it('maps all 6 fields with exact header casing for overridden record', () => {
    const record = {
      date: '2026-01-15',
      original_steps: 8000,
      original_distance_km: 6.4,
      effective_steps: 9000,
      effective_distance_km: 7.2,
      is_overridden: true,
      override: {},
    };
    const row = _toExportRow(record);
    expect(row.Date).toBe('2026-01-15');
    expect(row.Original_Steps).toBe(8000);
    expect(row.Original_Distance_KM).toBe(6.4);
    expect(row.Effective_Steps).toBe(9000);
    expect(row.Effective_Distance_KM).toBe(7.2);
    expect(row.Is_Overridden).toBe(true);
  });

  it('maps non-overridden record: Is_Overridden=false', () => {
    const record = {
      date: '2026-01-16',
      original_steps: 5000,
      original_distance_km: 4.0,
      effective_steps: 5000,
      effective_distance_km: 4.0,
      is_overridden: false,
      override: null,
    };
    const row = _toExportRow(record);
    expect(row.Is_Overridden).toBe(false);
    expect(row.Override_Note).toBeUndefined();
  });

  it('maps override object present but note absent → no note field', () => {
    const record = {
      date: '2026-01-17',
      original_steps: 5000,
      original_distance_km: 4.0,
      effective_steps: 5000,
      effective_distance_km: 4.0,
      is_overridden: true,
      override: {},
    };
    const row = _toExportRow(record);
    expect(row.Override_Note).toBeUndefined();
  });

  // --- _csvCell ---
  it('_csvCell: note containing , wraps in double quotes', () => {
    expect(_csvCell('run,fast')).toBe('"run,fast"');
  });

  it('_csvCell: note containing " wraps and doubles the quote', () => {
    expect(_csvCell('said "hello"')).toBe('"said ""hello"""');
  });

  it('_csvCell: note containing \\n wraps in double quotes; newline preserved', () => {
    expect(_csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('_csvCell: note containing \\r wraps in double quotes', () => {
    expect(_csvCell('a\rb')).toBe('"a\rb"');
  });

  it('_csvCell: note containing \\r\\n wraps in double quotes', () => {
    expect(_csvCell('a\r\nb')).toBe('"a\r\nb"');
  });

  it('_csvCell: plain string (no special chars) not quoted', () => {
    expect(_csvCell('hello')).toBe('hello');
  });

  it('_csvCell: boolean true → "true" (no quotes)', () => {
    expect(_csvCell(true)).toBe('true');
  });

  it('_csvCell: integer 12345 → "12345" (no quotes)', () => {
    expect(_csvCell(12345)).toBe('12345');
  });

  it('_csvCell: empty string → "" (not quoted)', () => {
    expect(_csvCell('')).toBe('');
  });

  it('_csvCell: boolean false → "false" (no quotes)', () => {
    expect(_csvCell(false)).toBe('false');
  });

  it('_csvCell: formula prefix = wraps in double quotes', () => {
    expect(_csvCell('=HYPERLINK("http://evil.example",A1)')).toBe('"=HYPERLINK(""http://evil.example"",A1)"');
  });

  it('_csvCell: formula prefix + wraps in double quotes', () => {
    expect(_csvCell('+1+1')).toBe('"+1+1"');
  });

  it('_csvCell: formula prefix - wraps in double quotes', () => {
    expect(_csvCell('-1')).toBe('"-1"');
  });

  it('_csvCell: formula prefix @ wraps in double quotes', () => {
    expect(_csvCell('@SUM(A1:A10)')).toBe('"@SUM(A1:A10)"');
  });

  // --- _toCsv ---
  it('_toCsv first line is the exact export header', () => {
    const record = {
      date: '2026-01-15',
      original_steps: 8000,
      original_distance_km: 6.4,
      effective_steps: 9000,
      effective_distance_km: 7.2,
      is_overridden: false,
      override: null,
    };
    const output = _toCsv([record]);
    expect(output.split('\r\n')[0]).toBe(
      'Date,Original_Steps,Original_Distance_KM,Effective_Steps,Effective_Distance_KM,Is_Overridden'
    );
  });

  it('_toCsv with 2 records → 3 lines (header + 2 rows)', () => {
    const r = {
      date: '2026-01-15',
      original_steps: 8000,
      original_distance_km: 6.4,
      effective_steps: 9000,
      effective_distance_km: 7.2,
      is_overridden: false,
      override: null,
    };
    const output = _toCsv([r, r]);
    expect(output.split('\r\n').length).toBe(3);
  });

  it('_toCsv with empty array → header-only CSV (no trailing CRLF body rows)', () => {
    const output = _toCsv([]);
    expect(output).toBe(CSV_HEADERS);
  });

  it('_toCsv row values round-trip without corruption', () => {
    const record = {
      date: '2026-01-15',
      original_steps: 8000,
      original_distance_km: 6.4,
      effective_steps: 9000,
      effective_distance_km: 7.2,
      is_overridden: true,
      override: {},
    };
    const csv = _toCsv([record]);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toBe('2026-01-15,8000,6.4,9000,7.2,true');
  });

  // --- _toJson ---
  it('_toJson produces pretty-printed JSON array of length 2', () => {
    const r = {
      date: '2026-01-15',
      original_steps: 8000,
      original_distance_km: 6.4,
      effective_steps: 9000,
      effective_distance_km: 7.2,
      is_overridden: false,
      override: null,
    };
    const output = _toJson([r, r]);
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(output).toContain('  '); // indented with spaces
  });

  it('_toJson each element has exactly the 7 CSV-header keys', () => {
    const r = {
      date: '2026-01-15',
      original_steps: 8000,
      original_distance_km: 6.4,
      effective_steps: 9000,
      effective_distance_km: 7.2,
      is_overridden: false,
      override: null,
    };
    const output = _toJson([r]);
    const parsed = JSON.parse(output);
    expect(Object.keys(parsed[0]).join(',')).toBe(CSV_HEADERS);
  });

  it('_toJson empty array → []', () => {
    const output = _toJson([]);
    expect(JSON.parse(output)).toEqual([]);
  });

  // --- CSV / JSON parity ---
  it('CSV and JSON parity: Date field values identical across both formats', () => {
    const records = [
      { date: '2026-01-15', original_steps: 8000, original_distance_km: 6.4, effective_steps: 9000, effective_distance_km: 7.2, is_overridden: false, override: null },
      { date: '2026-01-14', original_steps: 7000, original_distance_km: 5.6, effective_steps: 7000, effective_distance_km: 5.6, is_overridden: true, override: { note: 'Good' } },
      { date: '2026-01-13', original_steps: 6000, original_distance_km: 4.8, effective_steps: 6000, effective_distance_km: 4.8, is_overridden: false, override: null },
    ];
    const csvLines = _toCsv(records).split('\r\n');
    const jsonRows = JSON.parse(_toJson(records));
    for (let i = 0; i < records.length; i++) {
      // Date field is first column, no quoting needed
      const csvDate = csvLines[i + 1].split(',')[0];
      expect(jsonRows[i].Date).toBe(csvDate);
      // Also check Is_Overridden parity
      expect(String(jsonRows[i].Is_Overridden)).toBe(csvLines[i + 1].split(',')[5]);
    }
  });

  it('exporter.js contains no toISOString() call (timezone-safe contract)', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'exporter.js'), 'utf8');
    expect(source.includes('toISOString()')).toBe(false);
  });

  it('exporter.js uses named export, not default export', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'exporter.js'), 'utf8');
    expect(source.includes('export default')).toBe(false);
    expect(source.match(/export\s+(function|const|let)\s+\w+|export\s+\{/)).not.toBeNull();
  });
});

// ─── createExporter — FileSaver seam (ST-018) ─────────────────────────────────

describe('createExporter — exportCsv / exportJson through an injected FileSaver', () => {
  const SAMPLE_RECORDS = [
    {
      date: '2026-01-15',
      original_steps: 8000,
      original_distance_km: 6.4,
      effective_steps: 9000,
      effective_distance_km: 7.2,
      is_overridden: false,
      override: null,
    },
  ];

  let fileSaver;

  beforeEach(() => {
    fileSaver = { saveTextFile: vi.fn().mockResolvedValue({ location: null }) };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires a FileSaver', () => {
    expect(() => createExporter()).toThrow(TypeError);
    expect(() => createExporter({})).toThrow(TypeError);
  });

  it('exportCsv saves the CSV text with a dated .csv name and text/csv type', async () => {
    await createExporter(fileSaver).exportCsv(SAMPLE_RECORDS);
    expect(fileSaver.saveTextFile).toHaveBeenCalledWith(
      `step-tracker-export-${_localDate()}.csv`,
      'text/csv',
      _toCsv(SAMPLE_RECORDS)
    );
  });

  it('exportJson saves the JSON text with a dated .json name and application/json type', async () => {
    await createExporter(fileSaver).exportJson(SAMPLE_RECORDS);
    expect(fileSaver.saveTextFile).toHaveBeenCalledWith(
      `${EXPORT_FILENAME_PREFIX}${_localDate()}.json`,
      'application/json',
      _toJson(SAMPLE_RECORDS)
    );
  });

  it.each(['exportCsv', 'exportJson'])('%s never rejects: a failed save is logged', async (method) => {
    const failure = new Error('save failed');
    fileSaver.saveTextFile.mockRejectedValue(failure);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(createExporter(fileSaver)[method](SAMPLE_RECORDS)).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith('[exporter]', failure);
  });
});
