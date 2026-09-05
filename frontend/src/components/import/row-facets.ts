/** How many rows each filter chip would select, counted from the rows the table already holds. */

import type { ImportRowStatus } from '@/types/api';
import { matchesFilter, type PreviewRow, type RowFilter } from './preview-rows';

export type StatusCounts = Record<ImportRowStatus, number>;

export interface FilterCounts {
  readonly statuses: StatusCounts;
  readonly scrambled: number;
  readonly duplicate: number;
}

const NO_STATUS: readonly ImportRowStatus[] = [];

export function countFilters(rows: readonly PreviewRow[], filter: RowFilter): FilterCounts {
  const statuses: StatusCounts = { new: 0, updated: 0, unchanged: 0, duplicate: 0, rejected: 0 };
  let scrambled = 0;
  let duplicate = 0;

  for (const row of rows) {
    if (matchesFilter(row, { ...filter, statuses: NO_STATUS })) statuses[row.status] += 1;
    if (row.scrambled && matchesFilter(row, { ...filter, scrambled: false })) scrambled += 1;
    if (row.duplicate && matchesFilter(row, { ...filter, duplicate: false })) duplicate += 1;
  }

  return { statuses, scrambled, duplicate };
}
