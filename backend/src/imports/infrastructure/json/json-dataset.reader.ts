/**
 * Reads a JSON export: an array of records, one object per person, either at the top level or under
 * one key of a wrapper object. Records name their own fields, so the header is the union of the keys
 * in the order the file first uses them, and a record that omits a column contributes an empty cell.
 *
 * Records are located by scanning rather than by parsing the whole document, so every row keeps the
 * line number the rejection report and the source view are written in terms of, and readLine stops
 * at the record it was asked for.
 */

import { Injectable } from '@nestjs/common';
import {
  DatasetContents,
  DatasetReaderPort,
  DatasetUnreadableError,
  RawRow,
  SourceRecord,
} from '../../domain/ports/dataset-reader.port';

/** Half-open [start, end) over the decoded text: one record, exactly as the file wrote it. */
interface Span {
  readonly start: number;
  readonly end: number;
}

type Record_ = Record<string, unknown>;

const BLANK = new Set([' ', '\t', '\n', '\r', '\uFEFF']);
/** Where an unquoted scalar (a number, true, false, null) ends. */
const SCALAR_END = new Set([',', ']', '}', ' ', '\t', '\n', '\r']);

@Injectable()
export class JsonDatasetReader implements DatasetReaderPort {
  async read(buffer: Buffer): Promise<DatasetContents> {
    const text = buffer.toString('utf8');
    const lines = new LineIndex(text);
    const header: string[] = [];
    const seen = new Set<string>();
    const rows: RawRow[] = [];
    const records: { readonly lineNumber: number; readonly record: Record_ }[] = [];

    for (const span of recordSpans(text)) {
      const lineNumber = lines.lineAt(span.start);
      const record = parseRecord(text, span, lineNumber);
      for (const key of Object.keys(record)) {
        if (seen.has(key)) continue;
        seen.add(key);
        header.push(key);
      }
      records.push({ lineNumber, record });
    }

    if (records.length === 0) throw new DatasetUnreadableError('the file contains no JSON records');
    if (header.length === 0) {
      throw new DatasetUnreadableError('the JSON records carry no field names');
    }

    // Held back until the header is complete, so a column only later records use still lines up.
    for (const { lineNumber, record } of records) {
      rows.push({ lineNumber, fields: header.map((key) => cell(record[key])) });
    }

    return { header, rows };
  }

  /** Parses only the record asked for; the scan that finds it reads no values at all. */
  async readLine(buffer: Buffer, lineNumber: number): Promise<SourceRecord | null> {
    const text = buffer.toString('utf8');
    const lines = new LineIndex(text);

    for (const span of recordSpans(text)) {
      const line = lines.lineAt(span.start);
      // Records arrive in file order, so past the line the file does not hold it.
      if (line > lineNumber) return null;
      if (line !== lineNumber) continue;

      const record = parseRecord(text, span, line);
      // The record's own keys, not the union header: this view shows the file, not the import.
      const header = Object.keys(record);
      return {
        header,
        row: { lineNumber: line, fields: header.map((key) => cell(record[key])) },
        raw: text.slice(span.start, span.end),
      };
    }

    return null;
  }
}

/** Every record of the array, as the stretch of source text it occupies. */
function* recordSpans(text: string): Generator<Span> {
  const scanner = new Scanner(text);
  scanner.enterRecordArray();
  yield* scanner.elements();
}

function parseRecord(text: string, span: Span, lineNumber: number): Record_ {
  let value: unknown;
  try {
    value = JSON.parse(text.slice(span.start, span.end));
  } catch (error) {
    throw new DatasetUnreadableError(
      `the record on line ${lineNumber} is not readable as JSON: ${(error as Error).message}`,
    );
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DatasetUnreadableError(`the record on line ${lineNumber} is not a JSON object`);
  }
  return value as Record_;
}

/**
 * Cells are text by the time the ingestor sees them, and the columns that hold a list arrive as
 * Python `repr()` in the reference export, so a nested value is handed on as the JSON it was
 * written as rather than flattened into something neither parser would recognise.
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Walks the document's punctuation without decoding its values. */
class Scanner {
  private at = 0;

  constructor(private readonly text: string) {}

  /** Leaves the cursor just past the `[` that opens the records, wrapper object and all. */
  enterRecordArray(): void {
    this.skipBlank();
    const char = this.text[this.at];
    if (char === '[') {
      this.at++;
      return;
    }
    if (char === '{') {
      this.enterWrappedArray();
      return;
    }
    throw new DatasetUnreadableError('the file is not a JSON array of records');
  }

  *elements(): Generator<Span> {
    this.skipBlank();
    if (this.text[this.at] === ']') return;

    while (this.at < this.text.length) {
      this.skipBlank();
      const start = this.at;
      this.skipValue();
      if (this.at === start) {
        throw new DatasetUnreadableError(`the file has a stray "${this.text[start]}" where a record was expected`);
      }
      yield { start, end: this.at };

      this.skipBlank();
      const char = this.text[this.at];
      if (char === ',') {
        this.at++;
        continue;
      }
      if (char === ']' || char === undefined) return;
      throw new DatasetUnreadableError(`the file has a stray "${char}" between records`);
    }
  }

  /** `{"profiles": [...]}` and its variants: the first key whose value is an array holds them. */
  private enterWrappedArray(): void {
    this.at++;
    while (this.at < this.text.length) {
      this.skipBlank();
      if (this.text[this.at] !== '"') break;
      this.skipString();
      this.skipBlank();
      if (this.text[this.at] !== ':') break;
      this.at++;
      this.skipBlank();
      if (this.text[this.at] === '[') {
        this.at++;
        return;
      }
      this.skipValue();
      this.skipBlank();
      if (this.text[this.at] !== ',') break;
      this.at++;
    }
    throw new DatasetUnreadableError('the file is a JSON object with no array of records in it');
  }

  private skipBlank(): void {
    while (this.at < this.text.length && BLANK.has(this.text[this.at])) this.at++;
  }

  private skipValue(): void {
    const char = this.text[this.at];
    if (char === '"') return this.skipString();
    if (char === '{' || char === '[') return this.skipBracketed();
    while (this.at < this.text.length && !SCALAR_END.has(this.text[this.at])) this.at++;
  }

  /** Valid JSON nests its brackets, so counting one kind is enough to find the closing one. */
  private skipBracketed(): void {
    const open = this.text[this.at];
    const close = open === '{' ? '}' : ']';
    let depth = 0;

    while (this.at < this.text.length) {
      const char = this.text[this.at];
      if (char === '"') {
        this.skipString();
        continue;
      }
      this.at++;
      if (char === open) depth++;
      else if (char === close && --depth === 0) return;
    }

    throw new DatasetUnreadableError('the file ends inside a record');
  }

  private skipString(): void {
    this.at++;
    while (this.at < this.text.length) {
      const char = this.text[this.at];
      if (char === '\\') {
        this.at += 2;
        continue;
      }
      this.at++;
      if (char === '"') return;
    }
    throw new DatasetUnreadableError('the file ends inside a string');
  }
}

/** 1-based line numbers over the decoded text: characters, because the scanner counts characters. */
class LineIndex {
  private readonly newlines: number[] = [];

  constructor(text: string) {
    for (let index = text.indexOf('\n'); index >= 0; index = text.indexOf('\n', index + 1)) {
      this.newlines.push(index);
    }
  }

  lineAt(offset: number): number {
    let low = 0;
    let high = this.newlines.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.newlines[middle] < offset) low = middle + 1;
      else high = middle;
    }
    return low + 1;
  }
}
