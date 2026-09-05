/** Reads the uploaded dataset with csv-parse, in the most forgiving mode that still keeps records intact. */

import { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { parse as parseStream } from 'csv-parse';
import { parse } from 'csv-parse/sync';
import {
  DatasetContents,
  DatasetReaderPort,
  DatasetUnreadableError,
  RawRow,
  SourceRecord,
} from '../../domain/ports/dataset-reader.port';

interface ParsedRecord {
  readonly record: string[];
  readonly info: { readonly bytes: number };
}

const LF = 0x0a;
const CR = 0x0d;

/** Lenient on purpose: the damaged rows are what the preview exists to report. */
const PARSE_OPTIONS = {
  bom: true,
  columns: false,
  relax_column_count: true,
  relax_quotes: true,
  skip_empty_lines: true,
  trim: false,
  info: true,
} as const;

/** Fed to the parser one chunk at a time, so backpressure stops unread records piling up. */
const CHUNK_BYTES = 64 * 1024;

@Injectable()
export class CsvDatasetReader implements DatasetReaderPort {
  async read(buffer: Buffer): Promise<DatasetContents> {
    const records = this.parseRecords(buffer);
    if (records.length === 0) throw new DatasetUnreadableError('the file contains no CSV records');

    const lines = new LineIndex(buffer);
    const rows: RawRow[] = [];
    let header: string[] = [];
    let offset = 0;

    for (const [position, { record, info }] of records.entries()) {
      offset = skipBlank(buffer, offset);
      const lineNumber = lines.lineAt(offset);
      offset = info.bytes;

      if (position === 0) header = record.map((name) => name.trim());
      else rows.push({ lineNumber, fields: record });
    }

    if (header.length < 2) {
      throw new DatasetUnreadableError('the first line is not a comma-separated CSV header');
    }

    return { header, rows };
  }

  /** Stops at the requested line rather than materialising the whole file. */
  async readLine(buffer: Buffer, lineNumber: number): Promise<SourceRecord | null> {
    const lines = new LineWalk(buffer);
    let header: string[] = [];
    let records = 0;
    let offset = 0;

    try {
      for await (const { record, info } of this.streamRecords(buffer)) {
        const start = skipBlank(buffer, offset);
        const line = lines.lineAt(start);
        const end = info.bytes;
        offset = end;

        if (records++ === 0) {
          header = record.map((name) => name.trim());
          continue;
        }
        if (line === lineNumber) {
          return { header, row: { lineNumber: line, fields: record }, raw: sourceText(buffer, start, end) };
        }
        // Records arrive in file order, so past the line the file does not hold it.
        if (line > lineNumber) return null;
      }
    } catch (error) {
      throw unreadable(error);
    }

    return null;
  }

  private parseRecords(buffer: Buffer): ParsedRecord[] {
    try {
      return parse(buffer, PARSE_OPTIONS) as ParsedRecord[];
    } catch (error) {
      throw unreadable(error);
    }
  }

  private streamRecords(buffer: Buffer): AsyncIterable<ParsedRecord> {
    const parser = parseStream(PARSE_OPTIONS);
    Readable.from(chunksOf(buffer)).pipe(parser);
    return parser as AsyncIterable<ParsedRecord>;
  }
}

/** csv-parse reports every parse failure as a CsvError, which is an Error. */
function unreadable(error: unknown): DatasetUnreadableError {
  return new DatasetUnreadableError(`the file is not readable as CSV: ${(error as Error).message}`);
}

function* chunksOf(buffer: Buffer): Generator<Buffer> {
  for (let at = 0; at < buffer.length; at += CHUNK_BYTES) {
    yield buffer.subarray(at, at + CHUNK_BYTES);
  }
}

/** The record as the file wrote it, without the delimiter that ended it. */
function sourceText(buffer: Buffer, start: number, end: number): string {
  let last = end;
  while (last > start && (buffer[last - 1] === LF || buffer[last - 1] === CR)) last--;
  return buffer.toString('utf8', start, last);
}

/** Physical line numbers, taken from the buffer rather than from the parser. */
class LineIndex {
  private readonly newlines: number[] = [];

  constructor(buffer: Buffer) {
    for (let index = 0; index < buffer.length; index++) {
      if (buffer[index] === LF) this.newlines.push(index);
    }
  }

  /** 1-based line the byte at `offset` falls on. */
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

/** The same count as LineIndex, walked forwards instead of indexed. */
class LineWalk {
  private cursor = 0;
  private line = 1;

  constructor(private readonly buffer: Buffer) {}

  /** 1-based line the byte at `offset` falls on. Offsets must not go backwards. */
  lineAt(offset: number): number {
    while (this.cursor < offset) {
      if (this.buffer[this.cursor] === LF) this.line++;
      this.cursor++;
    }
    return this.line;
  }
}

/** Skipped empty lines are billed to the record that follows them; step over them first. */
function skipBlank(buffer: Buffer, offset: number): number {
  let cursor = offset;
  while (cursor < buffer.length && (buffer[cursor] === LF || buffer[cursor] === CR)) cursor++;
  return cursor;
}
