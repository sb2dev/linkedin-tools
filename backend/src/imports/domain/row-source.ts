/** One source line, explained column by column. */

import { compact } from 'src/shared/objects';
import { Profile } from '../../profiles/domain/profile';
import { truncate } from './text';
import { adoptRealignment } from './validation/block-realigner';
import { COLUMN_SPEC_BY_SOURCE } from './validation/column-catalog';
import { ProfileRowValidator } from './validation/profile-row.validator';
import { classifyRow, REJECTION_LABELS, RejectionReason } from './validation/row-classification';

/** What became of one cell. */
export type ColumnVerdict =
  /** Coerced to its column's shape and kept on the profile. */
  | 'kept'
  /** Supplied, and dropped: it did not fit its column, or its block was scrambled. */
  | 'quarantined'
  /** The file left this column blank. */
  | 'empty'
  /** No canonical field behind it: an unknown header column, or a field past the header's end. */
  | 'unmapped'
  /** The line was rejected before the validator read any cell. */
  | 'unread';

export interface SourceColumnReport {
  /** Position in the source header, 0-based; a shift is visible as values in the wrong index. */
  readonly index: number;
  /** Absent when the line carries more fields than the header declares columns. */
  readonly column?: string;
  /** As the file held it, whitespace collapsed and truncated; `raw` carries the line untouched. */
  readonly value: string;
  /** Dot-path of the canonical field this column feeds, when the catalog maps it. */
  readonly target?: string;
  readonly verdict: ColumnVerdict;
  /** Why the cell was quarantined. */
  readonly reason?: string;
}

/** One column the repair would rewrite, and what it would put there. */
export interface SourceRepairMove {
  readonly column: string;
  readonly from: string;
  readonly to: string;
}

export interface SourceRepairReport {
  /** Columns the block is shifted by; negative means the true value sits that many places earlier. */
  readonly offset: number;
  /** Populated block columns that validated at this offset, which is what proved it. */
  readonly evidence: number;
  readonly moves: readonly SourceRepairMove[];
}

export interface SourceRejectionReport {
  /** A RejectionReason code, as a plain string because it travels to the client as one. */
  readonly reason: string;
  readonly label: string;
  /** What this particular line did to earn the code. */
  readonly detail: string;
}

export interface SourceIdentity {
  readonly linkedinUsername: string;
  readonly linkedinUrl: string;
  readonly fullName: string;
}

export interface SourceRowReport {
  readonly lineNumber: number;
  /** The record as the file wrote it, quoting and spanned lines included. */
  readonly raw: string;
  readonly rawTruncated: boolean;
  readonly fieldCount: number;
  /** Columns the header declares; a row that does not match it here is a shifted or damaged one. */
  readonly expectedFieldCount: number;
  /** True when a source-dump path prefix had to be dropped before the record could be read. */
  readonly recovered: boolean;
  /** The cells that prefix occupied, in file order; empty unless `recovered`. */
  readonly droppedFields: readonly string[];
  readonly accepted: boolean;
  /** The multi-value block is shifted out of alignment, as the row stands. */
  readonly scrambled: boolean;
  readonly identity?: SourceIdentity;
  readonly rejection?: SourceRejectionReport;
  /** Every header column, in header order, plus any field beyond the header's end. */
  readonly columns: readonly SourceColumnReport[];
  /** What realignment would move, present only where an offset was proven and survived. */
  readonly repair?: SourceRepairReport;
}

/** The widest record in the reference export is 53 KB, so this truncates nothing real. */
export const MAX_RAW_CHARS = 64_000;

/** Enough of a cell to recognise the value; the whole of it is in `raw`. */
const MAX_VALUE_CHARS = 500;

export function explainSourceRow(
  header: readonly string[],
  fields: readonly string[],
  raw: string,
  lineNumber: number,
): SourceRowReport {
  const columns = header.map((name) => name.trim());
  const validator = new ProfileRowValidator(columns);
  const indexOf = new Map(columns.map((name, index) => [name, index]));

  const classification = classifyRow([...fields], {
    expectedFieldCount: columns.length,
    nameIndex: columns.indexOf('full_name'),
    urlIndex: columns.indexOf('linkedin_url'),
    header: columns,
  });

  const line = {
    lineNumber,
    raw: raw.length > MAX_RAW_CHARS ? raw.slice(0, MAX_RAW_CHARS) : raw,
    rawTruncated: raw.length > MAX_RAW_CHARS,
    fieldCount: fields.length,
    expectedFieldCount: columns.length,
  };

  if (classification.status === 'rejected') {
    return {
      ...line,
      recovered: false,
      droppedFields: [],
      accepted: false,
      scrambled: false,
      rejection: structuralRejection(classification.reason, fields.length, columns.length),
      columns: columnsOf(columns, fields, undefined),
    };
  }

  const recovered = classification.status === 'repairable';
  const read =
    classification.status === 'repairable' ? classification.repairedFields : classification.fields;
  const droppedFields = recovered ? fields.slice(0, fields.length - read.length) : [];

  const validation = validator.validate(read, { repaired: recovered });
  if (validation.status === 'rejected') {
    return {
      ...line,
      recovered,
      droppedFields,
      accepted: false,
      scrambled: false,
      rejection: {
        reason: validation.reason,
        label: REJECTION_LABELS[validation.reason],
        detail: validation.detail,
      },
      columns: columnsOf(columns, read, undefined),
    };
  }

  const profile = validation.profile;
  const adopted = profile.quality.drifted ? adoptRealignment(read, indexOf, validator) : null;

  return compact({
    ...line,
    recovered,
    droppedFields,
    accepted: true,
    scrambled: profile.quality.drifted,
    identity: identityOf(profile),
    columns: columnsOf(columns, read, profile),
    repair: adopted
      ? {
          offset: adopted.realignment.offset,
          evidence: adopted.realignment.evidence,
          moves: movesOf(columns, read, adopted.realignment.fields),
        }
      : undefined,
  });
}

/** Every header column with the cell that landed in it, and any field the header has no column for. */
function columnsOf(
  columns: readonly string[],
  fields: readonly string[],
  profile: Profile | undefined,
): SourceColumnReport[] {
  const quarantined = new Map(
    (profile?.quality.quarantined ?? []).map((field) => [field.column, field.reason]),
  );

  const width = Math.max(columns.length, fields.length);
  const reports: SourceColumnReport[] = [];

  for (let index = 0; index < width; index++) {
    const column = columns[index];
    const spec = column === undefined ? undefined : COLUMN_SPEC_BY_SOURCE.get(column);
    const value = truncate(fields[index] ?? '', MAX_VALUE_CHARS);
    const reason = spec === undefined ? undefined : quarantined.get(spec.source);
    reports.push(
      compact({
        index,
        column,
        value,
        target: spec?.target,
        verdict: verdictOf(value, spec !== undefined, profile !== undefined, reason !== undefined),
        reason,
      }),
    );
  }

  return reports;
}

/** Every supplied cell of a mapped column is kept or quarantined: the validator coerces them all. */
function verdictOf(
  value: string,
  mapped: boolean,
  validated: boolean,
  quarantined: boolean,
): ColumnVerdict {
  if (!value) return 'empty';
  if (!mapped) return 'unmapped';
  if (!validated) return 'unread';
  return quarantined ? 'quarantined' : 'kept';
}

/** Only the block columns move, so a move list is short even though the row is 77 columns wide. */
function movesOf(
  columns: readonly string[],
  before: readonly string[],
  after: readonly string[],
): SourceRepairMove[] {
  const moves: SourceRepairMove[] = [];
  // Both rows are exactly as wide as the header, so one index walks them together.
  for (const [index, column] of columns.entries()) {
    const from = before[index];
    const to = after[index];
    if (from === to) continue;
    moves.push({
      column,
      from: truncate(from, MAX_VALUE_CHARS),
      to: truncate(to, MAX_VALUE_CHARS),
    });
  }
  return moves;
}

/** The verdicts reached before the validator sees a cell, each said in terms of this line. */
function structuralRejection(
  reason: RejectionReason,
  fieldCount: number,
  expected: number,
): SourceRejectionReport {
  return {
    reason,
    label: REJECTION_LABELS[reason],
    detail: structuralDetail(reason, fieldCount, expected),
  };
}

function structuralDetail(reason: RejectionReason, fieldCount: number, expected: number): string {
  if (reason === RejectionReason.EmbeddedHeader) {
    return 'the line repeats the header, column for column, as though it described a person';
  }
  if (reason === RejectionReason.JunkLine) {
    return (
      `a path into the source dump opens the line, and the ${fieldCount} fields it parsed into` +
      ` hold no whole ${expected}-column record after it`
    );
  }
  // classifyRow has no fourth structural verdict: NO_IDENTITY is the validator's, not its.
  return (
    `${fieldCount} fields where the header declares ${expected}, so no cell is certain to be in` +
    ' its own column'
  );
}

function identityOf(profile: Profile): SourceIdentity {
  return {
    linkedinUsername: profile.identity.linkedinUsername,
    linkedinUrl: profile.identity.linkedinUrl,
    fullName: profile.person.fullName,
  };
}
