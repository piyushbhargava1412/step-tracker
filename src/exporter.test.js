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
import { _localDate } from './goal.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createExporter — serialisers', () => {
  // --- Constants ---
  it('CSV_HEADERS has the exact value', () => {
    expect(CSV_HEADERS).toBe(
      'Date,Original_Steps,Original_Distance_KM,Effective_Steps,Effective_Distance_KM,Is_Overridden,Override_Note'
    );
  });

  it('EXPORT_FILENAME_PREFIX has the exact value', () => {
    expect(EXPORT_FILENAME_PREFIX).toBe('step-tracker-export-');
  });

  // --- _toExportRow ---
  it('maps all 7 fields with exact header casing for overridden record', () => {
    const record = {
      date: '2026-01-15',
      original_steps: 8000,
      original_distance_km: 6.4,
      effective_steps: 9000,
      effective_distance_km: 7.2,
      is_overridden: true,
      override: { note: 'Good run' },
    };
    const row = _toExportRow(record);
    expect(row.Date).toBe('2026-01-15');
    expect(row.Original_Steps).toBe(8000);
    expect(row.Original_Distance_KM).toBe(6.4);
    expect(row.Effective_Steps).toBe(9000);
    expect(row.Effective_Distance_KM).toBe(7.2);
    expect(row.Is_Overridden).toBe(true);
    expect(row.Override_Note).toBe('Good run');
  });

  it('maps non-overridden record: Is_Overridden=false, Override_Note=""', () => {
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
    expect(row.Override_Note).toBe('');
  });

  it('maps override object present but note absent → Override_Note=""', () => {
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
    expect(row.Override_Note).toBe('');
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
  it('_toCsv first line equals CSV_HEADERS verbatim', () => {
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
    expect(output.split('\r\n')[0]).toBe(CSV_HEADERS);
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

  it('_toCsv note with comma and quote round-trips uncorrupted (RFC-4180)', () => {
    const record = {
      date: '2026-01-15',
      original_steps: 8000,
      original_distance_km: 6.4,
      effective_steps: 9000,
      effective_distance_km: 7.2,
      is_overridden: true,
      override: { note: 'a,b"c' },
    };
    const csv = _toCsv([record]);
    const dataLine = csv.split('\r\n')[1];
    // Last field is Override_Note quoted as "a,b""c"
    const match = dataLine.match(/"((?:[^"]|"")*)"$/);
    expect(match).not.toBeNull();
    const recovered = match[1].replace(/""/g, '"');
    expect(recovered).toBe('a,b"c');
  });

  it('_toCsv note with comma, quote, and newline round-trips (RFC-4180 DoD)', () => {
    const note = 'hello,world\n"quoted"';
    const record = {
      date: '2026-01-15',
      original_steps: 8000,
      original_distance_km: 6.4,
      effective_steps: 9000,
      effective_distance_km: 7.2,
      is_overridden: true,
      override: { note },
    };
    const csv = _toCsv([record]);
    // The whole CSV line will span two text lines due to embedded \n; join them to find the field
    const rawCell = _csvCell(note);
    expect(csv).toContain(rawCell);
    // Confirm it's wrapped in quotes and the original content is preserved
    expect(rawCell.startsWith('"')).toBe(true);
    expect(rawCell.endsWith('"')).toBe(true);
    const inner = rawCell.slice(1, -1).replace(/""/g, '"');
    expect(inner).toBe(note);
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

// ─── Task 2: createExporter — download seam ───────────────────────────────────

/**
 * Builds a minimal injected `doc` stub with a spy anchor element.
 * Returns { doc, anchorSpy } where anchorSpy is the fake <a> element.
 */
function makeDocStub() {
  const anchorSpy = {
    href: '',
    download: '',
    click: vi.fn(),
  };
  const doc = {
    createElement: vi.fn(() => anchorSpy),
  };
  return { doc, anchorSpy };
}

describe('createExporter — _triggerDownload / exportCsv / exportJson', () => {
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

  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  // ── exportCsv ─────────────────────────────────────────────────────────────

  it('exportCsv: createElement called with "a"', () => {
    const { doc } = makeDocStub();
    const { exportCsv } = createExporter(doc);
    exportCsv(SAMPLE_RECORDS);
    expect(doc.createElement).toHaveBeenCalledWith('a');
  });

  it('exportCsv: anchor.download ends with correct date and .csv extension', () => {
    const { doc, anchorSpy } = makeDocStub();
    const { exportCsv } = createExporter(doc);
    exportCsv(SAMPLE_RECORDS);
    const expectedDate = _localDate();
    expect(anchorSpy.download).toBe(`${EXPORT_FILENAME_PREFIX}${expectedDate}.csv`);
  });

  it('exportCsv: anchor.href is the objectURL returned by createObjectURL', () => {
    const { doc, anchorSpy } = makeDocStub();
    const { exportCsv } = createExporter(doc);
    exportCsv(SAMPLE_RECORDS);
    expect(anchorSpy.href).toBe('blob:mock-url');
  });

  it('exportCsv: anchor.click() is called once', () => {
    const { doc, anchorSpy } = makeDocStub();
    const { exportCsv } = createExporter(doc);
    exportCsv(SAMPLE_RECORDS);
    expect(anchorSpy.click).toHaveBeenCalledTimes(1);
  });

  it('exportCsv: URL.revokeObjectURL is called with the blob URL', () => {
    const { doc } = makeDocStub();
    const { exportCsv } = createExporter(doc);
    exportCsv(SAMPLE_RECORDS);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('exportCsv: URL.createObjectURL receives a Blob with type text/csv', () => {
    const { doc } = makeDocStub();
    const { exportCsv } = createExporter(doc);
    exportCsv(SAMPLE_RECORDS);
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/csv');
  });

  it('exportCsv: blob text equals _toCsv(records)', async () => {
    const { doc } = makeDocStub();
    const { exportCsv } = createExporter(doc);
    exportCsv(SAMPLE_RECORDS);
    const blob = URL.createObjectURL.mock.calls[0][0];
    const text = await blob.text();
    expect(text).toBe(_toCsv(SAMPLE_RECORDS));
  });

  // ── exportJson ────────────────────────────────────────────────────────────

  it('exportJson: anchor.download ends with correct date and .json extension', () => {
    const { doc, anchorSpy } = makeDocStub();
    const { exportJson } = createExporter(doc);
    exportJson(SAMPLE_RECORDS);
    const expectedDate = _localDate();
    expect(anchorSpy.download).toBe(`${EXPORT_FILENAME_PREFIX}${expectedDate}.json`);
  });

  it('exportJson: URL.createObjectURL receives a Blob with type application/json', () => {
    const { doc } = makeDocStub();
    const { exportJson } = createExporter(doc);
    exportJson(SAMPLE_RECORDS);
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
  });

  it('exportJson: blob text equals _toJson(records)', async () => {
    const { doc } = makeDocStub();
    const { exportJson } = createExporter(doc);
    exportJson(SAMPLE_RECORDS);
    const blob = URL.createObjectURL.mock.calls[0][0];
    const text = await blob.text();
    expect(text).toBe(_toJson(SAMPLE_RECORDS));
  });

  it('exportJson: URL.revokeObjectURL is called even when anchor.click throws (finally path)', () => {
    const { doc, anchorSpy } = makeDocStub();
    anchorSpy.click = vi.fn(() => { throw new Error('click failed'); });
    const { exportJson } = createExporter(doc);
    // Should not throw outward (caught internally)
    expect(() => exportJson(SAMPLE_RECORDS)).not.toThrow();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('exportCsv: URL.revokeObjectURL is called even when anchor.click throws (finally path)', () => {
    const { doc, anchorSpy } = makeDocStub();
    anchorSpy.click = vi.fn(() => { throw new Error('click failed'); });
    const { exportCsv } = createExporter(doc);
    expect(() => exportCsv(SAMPLE_RECORDS)).not.toThrow();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('exportCsv: console.error is called when click throws', () => {
    const { doc, anchorSpy } = makeDocStub();
    anchorSpy.click = vi.fn(() => { throw new Error('click failed'); });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { exportCsv } = createExporter(doc);
    exportCsv(SAMPLE_RECORDS);
    expect(consoleSpy).toHaveBeenCalledWith('[exporter]', expect.any(Error));
  });
});
