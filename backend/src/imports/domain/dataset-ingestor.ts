/** Turns parsed rows into the profiles an import would store and the report that justifies them. */

import { Profile } from '../../profiles/domain/profile';
import {
  IngestStats,
  RealignmentSample,
  RejectionGroup,
  RejectionSample,
} from './import-summary';
import { DatasetContents, RawRow } from './ports/dataset-reader.port';
import { IngestedRow } from './row-report';
import { truncate } from './text';
import { adoptRealignment } from './validation/block-realigner';
import { ProfileRowValidator } from './validation/profile-row.validator';
import {
  ClassifyOptions,
  classifyRow,
  REJECTION_LABELS,
  RejectionReason,
} from './validation/row-classification';

export interface IngestOptions {
  /** Whether a scrambled multi-value block may be realigned when the offset can be proven. */
  readonly repair: boolean;
}

export interface IngestStatistics extends IngestStats {
  readonly realignments: readonly RealignmentSample[];
}

export interface IngestOutcome {
  /** One profile per person, duplicates already collapsed. */
  readonly profiles: readonly Profile[];
  /** Every source line in file order, with what this run made of it. */
  readonly rows: readonly IngestedRow[];
  /** Rejections grouped by reason, for the preview report. */
  readonly rejections: readonly RejectionGroup[];
  /** Every rejected line, so a rejection can still be explained long after the run. */
  readonly rejectedLines: readonly RejectedRow[];
  readonly stats: IngestStatistics;
}

export interface RejectedRow extends RejectionSample {
  readonly reason: RejectionReason;
  readonly label: string;
}

export interface IngestComparison {
  readonly withoutRepair: IngestOutcome;
  readonly withRepair: IngestOutcome;
}

const MAX_REJECTION_SAMPLES = 3;
const MAX_REALIGNMENT_SAMPLES = 3;
const MAX_ROW_EXCERPT = 120;
const MAX_CELL_EXCERPT = 60;

/** Columns whose before/after values show at a glance that a realignment recovered real data. */
const REALIGNMENT_EVIDENCE_COLUMNS: readonly string[] = [
  'skills',
  'experience',
  'education',
  'regions',
  'countries',
  'profiles',
];

export function ingestDataset(contents: DatasetContents, options: IngestOptions): IngestOutcome {
  const pipeline = new RowPipeline(contents.header);
  const accumulator = new OutcomeAccumulator();

  for (const row of contents.rows) accumulate(accumulator, pipeline.process(row), options.repair);

  return accumulator.build();
}

/** Runs both repair policies over a single parse of the file. */
export function ingestBothWays(contents: DatasetContents): IngestComparison {
  const pipeline = new RowPipeline(contents.header);
  const withoutRepair = new OutcomeAccumulator();
  const withRepair = new OutcomeAccumulator();

  for (const row of contents.rows) {
    const outcome = pipeline.process(row);
    accumulate(withoutRepair, outcome, false);
    accumulate(withRepair, outcome, true);
  }

  return { withoutRepair: withoutRepair.build(), withRepair: withRepair.build() };
}

type RowOutcome =
  | { readonly status: 'rejected'; readonly lineNumber: number; readonly rejection: RejectedRow }
  | {
      readonly status: 'accepted';
      readonly lineNumber: number;
      readonly structurallyRepaired: boolean;
      readonly asIs: Profile;
      /** The profile a repairing run keeps; identical to `asIs` when nothing could be proven. */
      readonly realigned: Profile;
      readonly realignment?: RealignmentSample;
    };

function accumulate(accumulator: OutcomeAccumulator, outcome: RowOutcome, repair: boolean): void {
  if (outcome.status === 'rejected') {
    accumulator.reject(outcome.rejection);
    return;
  }
  if (outcome.structurallyRepaired) accumulator.countRepairableRow();
  if (!repair) {
    accumulator.accept(outcome.lineNumber, outcome.asIs);
    return;
  }
  accumulator.accept(outcome.lineNumber, outcome.realigned, outcome.realignment?.offset);
  if (outcome.realignment) accumulator.recordRealignment(outcome.realignment);
}

/** Classifies and validates one row, and works out what a repairing run would keep for it. */
class RowPipeline {
  private readonly validator: ProfileRowValidator;
  private readonly indexOf: ReadonlyMap<string, number>;
  private readonly classifyOptions: ClassifyOptions;

  constructor(header: readonly string[]) {
    const columns = header.map((name) => name.trim());
    this.validator = new ProfileRowValidator(columns);
    this.indexOf = new Map(columns.map((name, index) => [name, index]));
    this.classifyOptions = {
      expectedFieldCount: columns.length,
      nameIndex: columns.indexOf('full_name'),
      urlIndex: columns.indexOf('linkedin_url'),
      header: columns,
    };
  }

  process(row: RawRow): RowOutcome {
    const classification = classifyRow(row.fields, this.classifyOptions);
    if (classification.status === 'rejected') {
      return {
        status: 'rejected',
        lineNumber: row.lineNumber,
        rejection: rejectionOf(row, classification.reason),
      };
    }

    const structurallyRepaired = classification.status === 'repairable';
    const fields =
      classification.status === 'repairable' ? classification.repairedFields : classification.fields;

    const validation = this.validator.validate(fields, { repaired: structurallyRepaired });
    if (validation.status === 'rejected') {
      return {
        status: 'rejected',
        lineNumber: row.lineNumber,
        rejection: rejectionOf(row, validation.reason),
      };
    }

    const asIs = validation.profile;
    const repair = asIs.quality.drifted ? this.realign(fields) : undefined;

    return {
      status: 'accepted',
      lineNumber: row.lineNumber,
      structurallyRepaired,
      asIs,
      realigned: repair?.profile ?? asIs,
      realignment: repair?.sample,
    };
  }

  private realign(fields: readonly string[]): { profile: Profile; sample: RealignmentSample } | undefined {
    const adopted = adoptRealignment(fields, this.indexOf, this.validator);
    if (!adopted) return undefined;

    return {
      profile: adopted.profile,
      sample: {
        linkedinUsername: adopted.profile.identity.linkedinUsername,
        fullName: adopted.profile.person.fullName,
        offset: adopted.realignment.offset,
        before: this.evidence(fields),
        after: this.evidence(adopted.realignment.fields),
      },
    };
  }

  private evidence(fields: readonly string[]): Record<string, string> {
    const cells: Record<string, string> = {};
    for (const column of REALIGNMENT_EVIDENCE_COLUMNS) {
      const index = this.indexOf.get(column);
      if (index === undefined) continue;
      // classifyRow admitted this row, so it is exactly as wide as the header.
      cells[column] = truncate(fields[index], MAX_CELL_EXCERPT);
    }
    return cells;
  }
}

/** One source line as this run left it. */
interface RowRecord extends IngestedRow {
  duplicateRows: number;
  supersededByLine?: number;
}

interface AcceptedRecord extends RowRecord {
  readonly profile: Profile;
}

/** The rows that named one person, and the one whose profile the run keeps. */
interface PersonRows {
  winner: AcceptedRecord;
  readonly rows: AcceptedRecord[];
}

/** Collects the profiles and counts of one run, collapsing duplicates as rows arrive. */
class OutcomeAccumulator {
  private readonly byUsername = new Map<string, PersonRows>();
  private readonly rows: RowRecord[] = [];
  private readonly rejected: RejectedRow[] = [];
  private readonly realignments: RealignmentSample[] = [];
  private rowsAccepted = 0;
  private duplicatesCollapsed = 0;
  private scrambledRows = 0;
  private repairableRows = 0;
  private realignedRows = 0;
  private fieldsQuarantined = 0;

  accept(lineNumber: number, profile: Profile, realignedOffset?: number): void {
    this.rowsAccepted++;
    if (profile.quality.drifted) this.scrambledRows++;
    this.fieldsQuarantined += profile.quality.fieldsQuarantined;

    const record: AcceptedRecord = { lineNumber, profile, realignedOffset, duplicateRows: 0 };
    this.rows.push(record);

    const key = profile.identity.linkedinUsername;
    const person = this.byUsername.get(key);
    if (!person) {
      this.byUsername.set(key, { winner: record, rows: [record] });
      return;
    }

    person.rows.push(record);
    this.duplicatesCollapsed++;
    // Identical content is a re-export of the same row.
    if (person.winner.profile.contentHash === profile.contentHash) return;
    if (profile.quality.fieldsPopulated >= person.winner.profile.quality.fieldsPopulated) {
      person.winner = record;
    }
  }

  reject(rejection: RejectedRow): void {
    this.rejected.push(rejection);
    this.rows.push({
      lineNumber: rejection.lineNumber,
      // Rebuilt rather than passed through: the row already carries the line number.
      rejection: { reason: rejection.reason, label: rejection.label, excerpt: rejection.excerpt },
      duplicateRows: 0,
    });
  }

  countRepairableRow(): void {
    this.repairableRows++;
  }

  recordRealignment(sample: RealignmentSample): void {
    this.realignedRows++;
    if (this.realignments.length < MAX_REALIGNMENT_SAMPLES) this.realignments.push(sample);
  }

  build(): IngestOutcome {
    this.settleDuplicates();
    return {
      profiles: [...this.byUsername.values()].map((person) => person.winner.profile),
      rows: this.rows,
      rejections: this.groupRejections(),
      rejectedLines: this.rejected,
      stats: {
        rowsTotal: this.rowsAccepted + this.rejected.length,
        rowsAccepted: this.rowsAccepted,
        rowsRejected: this.rejected.length,
        duplicatesCollapsed: this.duplicatesCollapsed,
        scrambledRows: this.scrambledRows,
        repairableRows: this.repairableRows,
        realignedRows: this.realignedRows,
        fieldsQuarantined: this.fieldsQuarantined,
        realignments: this.realignments,
      },
    };
  }

  /** Which row a person's other rows collapsed into, now that every row for them has been read. */
  private settleDuplicates(): void {
    for (const person of this.byUsername.values()) {
      person.winner.duplicateRows = person.rows.length - 1;
      for (const row of person.rows) {
        if (row !== person.winner) row.supersededByLine = person.winner.lineNumber;
      }
    }
  }

  /** The commonest failure first, with the few lines that show what it looks like. */
  private groupRejections(): RejectionGroup[] {
    const groups = new Map<RejectionReason, { label: string; count: number; samples: RejectionSample[] }>();

    for (const line of this.rejected) {
      const group = groups.get(line.reason) ?? { label: line.label, count: 0, samples: [] };
      group.count++;
      if (group.samples.length < MAX_REJECTION_SAMPLES) {
        group.samples.push({ lineNumber: line.lineNumber, excerpt: line.excerpt });
      }
      groups.set(line.reason, group);
    }

    return [...groups.entries()]
      .map(([reason, group]) => ({
        reason,
        label: group.label,
        count: group.count,
        samples: group.samples,
      }))
      .sort((a, b) => b.count - a.count);
  }
}

function rejectionOf(row: RawRow, reason: RejectionReason): RejectedRow {
  return {
    lineNumber: row.lineNumber,
    reason,
    label: REJECTION_LABELS[reason],
    excerpt: excerptOf(row.fields),
  };
}

/** Enough of the offending line to recognise it in the file, without shipping a wrecked record. */
function excerptOf(fields: readonly string[]): string {
  return truncate(fields.slice(0, 6).join(','), MAX_ROW_EXCERPT);
}
