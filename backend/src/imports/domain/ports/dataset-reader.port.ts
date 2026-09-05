/** Reads an uploaded dataset into raw rows. */

export const DATASET_READER = Symbol('DatasetReaderPort');

/** The bytes are not a dataset the bound reader can parse. Callers answer it with a 400. */
export class DatasetUnreadableError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'DatasetUnreadableError';
  }
}

export interface RawRow {
  /** 1-based line number in the source file, for the rejection report. */
  readonly lineNumber: number;
  readonly fields: string[];
}

export interface DatasetContents {
  readonly header: string[];
  readonly rows: readonly RawRow[];
}

/** One record of the file, with the source text it was parsed from. */
export interface SourceRecord {
  readonly header: string[];
  readonly row: RawRow;
  /** The record exactly as the file holds it, spanned lines and quoting included. */
  readonly raw: string;
}

export interface DatasetReaderPort {
  /** @throws DatasetUnreadableError when the bytes carry no parseable header and rows. */
  read(buffer: Buffer): Promise<DatasetContents>;

  /**
   * The single record that starts at `lineNumber`, or null when no record starts there. Reads only
   * as far as that line, so showing one row of a 40 MB upload does not parse the other 39.
   *
   * @throws DatasetUnreadableError when the bytes carry no parseable header and rows.
   */
  readLine(buffer: Buffer, lineNumber: number): Promise<SourceRecord | null>;
}
