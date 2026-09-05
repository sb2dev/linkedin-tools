/** The reading of an import row that the preview table works from. */

import type {
  ImportCounts,
  ImportPreview,
  ImportRowOutcome,
  ImportRowReport,
  ImportRowStatus,
} from '@/types/api';
import { joinParts, titleCase } from '@/lib/format';

export const STATUSES: readonly ImportRowStatus[] = [
  'new',
  'updated',
  'unchanged',
  'duplicate',
  'rejected',
];

const STATUS_LABELS: Record<ImportRowStatus, string> = {
  new: 'New',
  updated: 'Update',
  unchanged: 'Unchanged',
  duplicate: 'Duplicate',
  rejected: 'Rejected',
};

export function statusLabel(status: ImportRowStatus): string {
  return STATUS_LABELS[status];
}

/** One line of the file as the table shows it. Every display string is resolved once, up front. */
export interface PreviewRow {
  lineNumber: number;
  status: ImportRowStatus;
  /** Display name, or the rejection label when the line names nobody. */
  name: string;
  /** "title at company", empty when neither is known. */
  role: string;
  location: string;
  skills: number;
  quality: number;
  scrambled: boolean;
  realigned: boolean;
  /** How far the block was moved, when it was. */
  offset?: number;
  /** Lines folded into this one because they describe the same person. */
  duplicatesCollapsed: number;
  /** The line that kept the person, when this line is the one that folded away. */
  duplicateOfLine?: number;
  /** Either side of a collapse: the line that survived, or the line that folded into it. */
  duplicate: boolean;
  /** The rejection code, which is what tells the three refusal reasons apart. */
  rejectionReason?: string;
  excerpt?: string;
  /** Everything the search box reads, lowercased once so matching stays a substring test. */
  haystack: string;
}

/**
 * The verdict under the repair policy in force. `withRepair` is present only where realignment
 * changes something for that row, so absent means the two policies agree about it.
 */
export function outcomeUnder(row: ImportRowReport, repair: boolean): ImportRowOutcome {
  return repair ? (row.withRepair ?? row.outcome) : row.outcome;
}

/**
 * The totals under that same policy. RepairCounts carries only what realignment can move, so the
 * rest - rows in the file, rows rejected, duplicates collapsed - is taken from the plain counts.
 */
export function countsUnder(preview: ImportPreview, repair: boolean): ImportCounts {
  return repair ? { ...preview.counts, ...preview.countsWithRepair } : preview.counts;
}

export function resolveRow(row: ImportRowReport, repair = false): PreviewRow {
  const outcome = outcomeUnder(row, repair);
  const rejection = row.rejection;
  const name =
    rejection !== undefined
      ? rejection.label
      : titleCase(row.fullName) || (row.linkedinUsername ?? `Line ${row.lineNumber}`);

  const haystack = [
    name,
    row.linkedinUsername,
    row.jobTitle,
    row.companyName,
    row.location,
    rejection?.reason,
    rejection?.excerpt,
    String(row.lineNumber),
  ]
    .filter((part): part is string => part !== undefined)
    .join(' ')
    .toLowerCase();

  return {
    lineNumber: row.lineNumber,
    status: outcome.status,
    name,
    role: joinParts([titleCase(row.jobTitle), titleCase(row.companyName)], ' at '),
    location: titleCase(row.location),
    skills: outcome.totalSkills,
    quality: outcome.qualityScore,
    scrambled: outcome.scrambled,
    realigned: outcome.realigned,
    offset: outcome.offset,
    duplicatesCollapsed: outcome.duplicateRows,
    duplicateOfLine: outcome.supersededByLine,
    duplicate: outcome.duplicateRows > 0 || outcome.supersededByLine !== undefined,
    rejectionReason: rejection?.reason,
    excerpt: rejection?.excerpt,
    haystack,
  };
}

export function resolveRows(rows: readonly ImportRowReport[], repair = false): PreviewRow[] {
  return rows.map((row) => resolveRow(row, repair));
}

/** The filter the table applies: OR within a facet, AND across facets. */
export interface RowFilter {
  readonly text: string;
  readonly statuses: readonly ImportRowStatus[];
  readonly scrambled: boolean;
  readonly duplicate: boolean;
}

export const NO_FILTER: RowFilter = {
  text: '',
  statuses: [],
  scrambled: false,
  duplicate: false,
};

export function isFiltered(filter: RowFilter): boolean {
  return (
    filter.text.trim().length > 0 ||
    filter.statuses.length > 0 ||
    filter.scrambled ||
    filter.duplicate
  );
}

/** Adds or removes one status, leaving the rest of the filter alone. */
export function toggleStatus(filter: RowFilter, status: ImportRowStatus): RowFilter {
  const statuses = filter.statuses.includes(status)
    ? filter.statuses.filter((entry) => entry !== status)
    : [...filter.statuses, status];
  return { ...filter, statuses };
}

/** Every whitespace-separated term has to appear, so a second word narrows rather than widens. */
function matchesText(row: PreviewRow, text: string): boolean {
  const terms = text
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
  return terms.every((term) => row.haystack.includes(term));
}

export function matchesFilter(row: PreviewRow, filter: RowFilter): boolean {
  if (filter.statuses.length > 0 && !filter.statuses.includes(row.status)) return false;
  if (filter.scrambled && !row.scrambled) return false;
  if (filter.duplicate && !row.duplicate) return false;
  return matchesText(row, filter.text);
}

export function filterRows(rows: readonly PreviewRow[], filter: RowFilter): PreviewRow[] {
  return rows.filter((row) => matchesFilter(row, filter));
}

export type RowSortKey = 'line' | 'name' | 'quality';
export type SortDirection = 'asc' | 'desc';

export interface RowSort {
  readonly key: RowSortKey;
  readonly direction: SortDirection;
}

export const DEFAULT_SORT: RowSort = { key: 'line', direction: 'asc' };

function compareOn(key: RowSortKey, left: PreviewRow, right: PreviewRow): number {
  switch (key) {
    case 'name':
      return left.name.localeCompare(right.name);
    case 'quality':
      return left.quality - right.quality;
    case 'line':
      return left.lineNumber - right.lineNumber;
  }
}

/** Line number breaks every tie, so the order never depends on where a row sat in the array. */
export function sortRows(rows: readonly PreviewRow[], sort: RowSort): PreviewRow[] {
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const primary = compareOn(sort.key, left, right);
    if (primary !== 0) return primary * direction;
    return left.lineNumber - right.lineNumber;
  });
}

/** Clicking the column that already sorts flips its direction; a new column starts ascending. */
export function nextSort(sort: RowSort, key: RowSortKey): RowSort {
  if (sort.key !== key) return { key, direction: 'asc' };
  return { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' };
}
