/** Structural classification of a raw row, whichever format the reader took it from. */

import { LINKEDIN_PROFILE_URL, NAME_SHAPED } from './value-kinds';

export enum RejectionReason {
  /** A grep artifact from the source dump: `H:\New folder\leak\...part-00001.csv(15807): ...`. */
  JunkLine = 'JUNK_LINE',
  EmbeddedHeader = 'EMBEDDED_HEADER',
  /** An unescaped delimiter shifted the record; the row cannot be realigned. Delimited files only. */
  FieldCountMismatch = 'FIELD_COUNT_MISMATCH',
  /** No name plus no resolvable LinkedIn profile URL: nothing to key the person on. */
  NoIdentity = 'NO_IDENTITY',
}

export const REJECTION_LABELS: Record<RejectionReason, string> = {
  [RejectionReason.JunkLine]: 'Source-dump artifact, not a profile',
  [RejectionReason.EmbeddedHeader]: 'A repeated header row',
  [RejectionReason.FieldCountMismatch]: 'Malformed record, wrong number of fields',
  [RejectionReason.NoIdentity]: 'No name or LinkedIn URL to identify the person',
};

export type RowClassification =
  | { status: 'usable'; fields: string[]; repaired: boolean }
  | { status: 'repairable'; fields: string[]; repairedFields: string[]; reason: RejectionReason }
  | { status: 'rejected'; reason: RejectionReason };

/** Column 0 of a junk line is a Windows path into the dump the data was scraped from. */
const JUNK_PREFIX = /^[A-Za-z]:\\.*\\.*\.csv\(\d+\)/;

export interface ClassifyOptions {
  readonly expectedFieldCount: number;
  /** Index of `full_name` in the header. */
  readonly nameIndex: number;
  /** Index of `linkedin_url` in the header. */
  readonly urlIndex: number;
  /** The header row itself, to recognise it if it reappears in the data. */
  readonly header: readonly string[];
}

export function classifyRow(fields: string[], options: ClassifyOptions): RowClassification {
  const { expectedFieldCount, header } = options;

  if (fields.length === expectedFieldCount && equalsHeader(fields, header)) {
    return { status: 'rejected', reason: RejectionReason.EmbeddedHeader };
  }

  const isJunk = JUNK_PREFIX.test(fields[0]);

  if (fields.length === expectedFieldCount && !isJunk) {
    return { status: 'usable', fields, repaired: false };
  }

  // A junk-prefixed row may carry a complete record after the artifact.
  if (isJunk && fields.length > expectedFieldCount) {
    const tail = fields.slice(fields.length - expectedFieldCount);
    if (looksLikeAProfileRow(tail, options)) {
      return {
        status: 'repairable',
        fields,
        repairedFields: tail,
        reason: RejectionReason.JunkLine,
      };
    }
  }

  if (isJunk) return { status: 'rejected', reason: RejectionReason.JunkLine };
  return { status: 'rejected', reason: RejectionReason.FieldCountMismatch };
}

function looksLikeAProfileRow(fields: string[], { nameIndex, urlIndex }: ClassifyOptions): boolean {
  const name = (fields[nameIndex] ?? '').trim();
  const url = (fields[urlIndex] ?? '').trim();
  return NAME_SHAPED.test(name) && LINKEDIN_PROFILE_URL.test(url);
}

function equalsHeader(fields: readonly string[], header: readonly string[]): boolean {
  return fields.every((value, i) => value.trim() === header[i]);
}
