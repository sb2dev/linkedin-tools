/** The per-row verdict the preview table is built on. */

import { compact, isFilledString } from 'src/shared/objects';
import { Profile } from '../../profiles/domain/profile';

export type ImportRowStatus = 'new' | 'updated' | 'unchanged' | 'duplicate' | 'rejected';

/** What the ingestion pipeline recorded about one source line, under one repair policy. */
export interface IngestedRow {
  /** 1-based line number in the uploaded file. */
  readonly lineNumber: number;
  /** The profile this row produced; absent when the row was rejected. */
  readonly profile?: Profile;
  readonly rejection?: RowRejection;
  /** How far this row's multi-value block was moved, when the run realigned it. */
  readonly realignedOffset?: number;
  /** Accepted rows that collapsed into this one because they describe the same person. */
  readonly duplicateRows: number;
  /** The line whose profile was kept instead of this one's, when another row won the person. */
  readonly supersededByLine?: number;
}

export interface RowRejection {
  /** A RejectionReason code, kept as a plain string because it travels to the client as one. */
  readonly reason: string;
  readonly label: string;
  readonly excerpt: string;
}

/** What one repair policy would do with a row. */
export interface ImportRowOutcome {
  readonly status: ImportRowStatus;
  /** The multi-value block is still shifted out of alignment under this policy. */
  readonly scrambled: boolean;
  readonly realigned: boolean;
  /** How far the block was moved, when it was. */
  readonly offset?: number;
  readonly totalSkills: number;
  /** 0..1: populated fields as a share of the fields the row supplied. */
  readonly qualityScore: number;
  readonly duplicateRows: number;
  readonly supersededByLine?: number;
}

/** One source line. */
export interface ImportRowReport {
  readonly lineNumber: number;
  readonly linkedinUsername?: string;
  readonly fullName?: string;
  readonly jobTitle?: string;
  readonly companyName?: string;
  readonly location?: string;
  readonly outcome: ImportRowOutcome;
  /** The same row with block realignment enabled; absent when the repair changes nothing for it. */
  readonly withRepair?: ImportRowOutcome;
  readonly rejection?: RowRejection;
}

export interface RowReport {
  readonly rows: readonly ImportRowReport[];
  /** Rows past the cap, reported so the table can say what it is not showing. */
  readonly omitted: number;
}

/** The cap on rows described individually. */
export const ROW_REPORT_LIMIT = 5000;

/** Pairs the repaired and unrepaired runs by position, so a row can show both verdicts. */
export function buildRowReport(
  withoutRepair: readonly IngestedRow[],
  withRepair: readonly IngestedRow[],
  storedHashes: ReadonlyMap<string, string>,
  limit: number,
): RowReport {
  const rows = withoutRepair
    .slice(0, limit)
    .map((row, index) => reportOf(row, withRepair[index], storedHashes));
  return { rows, omitted: Math.max(withoutRepair.length - rows.length, 0) };
}

function reportOf(
  plain: IngestedRow,
  repaired: IngestedRow,
  storedHashes: ReadonlyMap<string, string>,
): ImportRowReport {
  if (!plain.profile || !repaired.profile) {
    return compact({
      lineNumber: plain.lineNumber,
      outcome: rejectedOutcome(),
      rejection: plain.rejection,
    });
  }

  const profile = plain.profile;
  const outcome = outcomeOf(plain, profile, storedHashes);
  const repairedOutcome = outcomeOf(repaired, repaired.profile, storedHashes);

  return compact({
    lineNumber: plain.lineNumber,
    linkedinUsername: profile.identity.linkedinUsername,
    fullName: profile.person.fullName,
    jobTitle: profile.job?.title,
    companyName: profile.job?.company?.name,
    location: placeOf(profile),
    outcome,
    withRepair: sameOutcome(outcome, repairedOutcome) ? undefined : repairedOutcome,
  });
}

/** Both outcomes are built by the same function, so equal contents serialise identically. */
function sameOutcome(a: ImportRowOutcome, b: ImportRowOutcome): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function outcomeOf(
  row: IngestedRow,
  profile: Profile,
  storedHashes: ReadonlyMap<string, string>,
): ImportRowOutcome {
  return compact({
    status: statusOf(row, profile, storedHashes),
    scrambled: profile.quality.drifted,
    realigned: row.realignedOffset !== undefined,
    offset: row.realignedOffset,
    totalSkills: profile.skills?.length ?? 0,
    qualityScore: profile.quality.score,
    duplicateRows: row.duplicateRows,
    supersededByLine: row.supersededByLine,
  });
}

/** A collapsed row changes nothing on its own: the corpus verdict belongs to the row that won. */
function statusOf(
  row: IngestedRow,
  profile: Profile,
  storedHashes: ReadonlyMap<string, string>,
): ImportRowStatus {
  if (row.supersededByLine !== undefined) return 'duplicate';
  const stored = storedHashes.get(profile.identity.linkedinUsername);
  if (stored === undefined) return 'new';
  return stored === profile.contentHash ? 'unchanged' : 'updated';
}

function rejectedOutcome(): ImportRowOutcome {
  return {
    status: 'rejected',
    scrambled: false,
    realigned: false,
    totalSkills: 0,
    qualityScore: 0,
    duplicateRows: 0,
  };
}

function placeOf(profile: Profile): string | undefined {
  const place = profile.location;
  if (!place) return undefined;
  if (isFilledString(place.name)) return place.name;
  const parts = [place.locality, place.region, place.country].filter(isFilledString);
  return parts.length > 0 ? parts.join(', ') : undefined;
}
