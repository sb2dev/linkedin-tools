/** The vocabulary an import reports itself in. */

import { Profile } from '../../profiles/domain/profile';
import { ImportRowReport } from './row-report';

export type ImportStatus = 'previewed' | 'committed' | 'expired';

/** How long a preview stays committable. Short because it holds the whole upload until then. */
export const PREVIEW_TTL_MS = 60 * 60 * 1000;

/** What the pipeline learned from the rows themselves, before any store was consulted. */
export interface IngestStats {
  readonly rowsTotal: number;
  readonly rowsAccepted: number;
  readonly rowsRejected: number;
  /** Accepted rows dropped because another row carries the same person. */
  readonly duplicatesCollapsed: number;
  /** Accepted rows whose multi-value block is still scrambled after whatever repair was allowed. */
  readonly scrambledRows: number;
  /** Rows that only parsed at all after a source-dump prefix was stripped. */
  readonly repairableRows: number;
  /** Accepted rows whose block was moved back into place, when repair was allowed. */
  readonly realignedRows: number;
  readonly fieldsQuarantined: number;
}

/** What the resulting profiles mean for the corpus, decided by comparing content hashes. */
export interface ChangeCounts {
  readonly profilesNew: number;
  readonly profilesUpdated: number;
  readonly profilesUnchanged: number;
}

export interface ImportCounts extends IngestStats, ChangeCounts {}

/** The same import run with block realignment enabled, so the preview can price the option. */
export interface RepairCounts extends ChangeCounts {
  readonly rowsAccepted: number;
  readonly scrambledRows: number;
  readonly realignedRows: number;
  readonly fieldsQuarantined: number;
}

export interface RejectionSample {
  readonly lineNumber: number;
  readonly excerpt: string;
}

export interface RejectionGroup {
  /** A RejectionReason code, kept as a plain string because it travels to the client as one. */
  readonly reason: string;
  readonly label: string;
  readonly count: number;
  readonly samples: readonly RejectionSample[];
}

/** Evidence for one repaired row: which columns moved, and to what. */
export interface RealignmentSample {
  readonly linkedinUsername: string;
  readonly fullName: string;
  readonly offset: number;
  readonly before: Record<string, string>;
  readonly after: Record<string, string>;
}

export interface ImportPreview {
  readonly importId: string;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly status: ImportStatus;
  readonly counts: ImportCounts;
  readonly countsWithRepair: RepairCounts;
  readonly rejections: readonly RejectionGroup[];
  /** Every source line in file order, up to ROW_REPORT_LIMIT of them. */
  readonly rows: readonly ImportRowReport[];
  /** Rows past that cap, so the table can say what it is not showing. */
  readonly rowsOmitted: number;
  readonly repairSample: readonly RealignmentSample[];
}

export interface ImportRunSummary {
  readonly importId: string;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly committedAt?: string;
  readonly status: ImportStatus;
  readonly counts: ImportCounts;
}

/** Splits profiles into new / updated / unchanged against the hashes already stored. */
export function classifyChanges(
  profiles: readonly Profile[],
  storedHashes: ReadonlyMap<string, string>,
): ChangeCounts {
  let profilesNew = 0;
  let profilesUpdated = 0;
  let profilesUnchanged = 0;

  for (const profile of profiles) {
    const stored = storedHashes.get(profile.identity.linkedinUsername);
    if (stored === undefined) profilesNew++;
    else if (stored === profile.contentHash) profilesUnchanged++;
    else profilesUpdated++;
  }

  return { profilesNew, profilesUpdated, profilesUnchanged };
}

export function toImportCounts(stats: IngestStats, changes: ChangeCounts): ImportCounts {
  return {
    rowsTotal: stats.rowsTotal,
    rowsAccepted: stats.rowsAccepted,
    rowsRejected: stats.rowsRejected,
    duplicatesCollapsed: stats.duplicatesCollapsed,
    scrambledRows: stats.scrambledRows,
    repairableRows: stats.repairableRows,
    realignedRows: stats.realignedRows,
    fieldsQuarantined: stats.fieldsQuarantined,
    profilesNew: changes.profilesNew,
    profilesUpdated: changes.profilesUpdated,
    profilesUnchanged: changes.profilesUnchanged,
  };
}

export function toRepairCounts(stats: IngestStats, changes: ChangeCounts): RepairCounts {
  return {
    rowsAccepted: stats.rowsAccepted,
    scrambledRows: stats.scrambledRows,
    realignedRows: stats.realignedRows,
    fieldsQuarantined: stats.fieldsQuarantined,
    profilesNew: changes.profilesNew,
    profilesUpdated: changes.profilesUpdated,
    profilesUnchanged: changes.profilesUnchanged,
  };
}
