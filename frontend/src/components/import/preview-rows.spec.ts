/**
 * The reading of an import row the preview table works from, and the filter and sort over it. All
 * of it is pure, and all of it decides what an operator sees before they approve a write.
 */

import { describe, expect, it } from 'vitest';
import type { ImportRowStatus } from '@/types/api';
import { importOutcome, importPreview, importRow, rejectedRow } from '@/test/fixtures';
import {
  DEFAULT_SORT,
  NO_FILTER,
  countsUnder,
  filterRows,
  isFiltered,
  matchesFilter,
  nextSort,
  outcomeUnder,
  resolveRow,
  resolveRows,
  sortRows,
  statusLabel,
  toggleStatus,
} from './preview-rows';

describe('statusLabel', () => {
  it('gives every status a word a reader recognises', () => {
    const statuses: ImportRowStatus[] = ['new', 'updated', 'unchanged', 'duplicate', 'rejected'];

    expect(statuses.map(statusLabel)).toEqual([
      'New',
      'Update',
      'Unchanged',
      'Duplicate',
      'Rejected',
    ]);
  });
});

describe('resolveRow', () => {
  it('names the person the row describes', () => {
    const row = resolveRow(importRow(4, { fullName: 'joey holland' }));

    expect(row.name).toBe('Joey Holland');
    expect(row.lineNumber).toBe(4);
  });

  it('falls back to the username, then to the line number, when no name survived', () => {
    expect(resolveRow(importRow(4, { fullName: undefined, linkedinUsername: 'joeyh' })).name).toBe('joeyh');
    expect(
      resolveRow(importRow(9, { fullName: undefined, linkedinUsername: undefined })).name,
    ).toBe('Line 9');
  });

  it('uses the rejection label for a line that names nobody', () => {
    const row = resolveRow(rejectedRow(12, 'junk_line', '/mnt/dump'));

    expect(row.status).toBe('rejected');
    expect(row.rejectionReason).toBe('junk_line');
    expect(row.excerpt).toBe('/mnt/dump');
  });

  it('reads the role as "title at company"', () => {
    const row = resolveRow(importRow(1, { jobTitle: 'head of growth', companyName: 'northwind' }));

    expect(row.role).toBe('Head of Growth at Northwind');
  });

  it('leaves the role empty when the row carried neither', () => {
    expect(resolveRow(importRow(1, { jobTitle: undefined, companyName: undefined })).role).toBe('');
  });

  it('calls both sides of a collapse a duplicate', () => {
    const kept = resolveRow(importRow(1, { outcome: importOutcome({ duplicateRows: 2 }) }));
    const folded = resolveRow(importRow(2, { outcome: importOutcome({ supersededByLine: 1 }) }));
    const neither = resolveRow(importRow(3));

    expect(kept.duplicate).toBe(true);
    expect(kept.duplicatesCollapsed).toBe(2);
    expect(folded.duplicate).toBe(true);
    expect(folded.duplicateOfLine).toBe(1);
    expect(neither.duplicate).toBe(false);
  });

  it('carries the realignment offset when the row was moved', () => {
    const row = resolveRow(importRow(1, { outcome: importOutcome({ realigned: true, offset: -3 }) }));

    expect(row.realigned).toBe(true);
    expect(row.offset).toBe(-3);
  });

  it('builds a lowercase haystack out of everything the box searches', () => {
    const row = resolveRow(
      importRow(7, { fullName: 'Joey Holland', linkedinUsername: 'joeyh', companyName: 'Garver' }),
    );

    expect(row.haystack).toContain('joey holland');
    expect(row.haystack).toContain('joeyh');
    expect(row.haystack).toContain('garver');
    expect(row.haystack).toContain('7');
  });

  it('resolves a whole list at once', () => {
    expect(resolveRows([importRow(1), importRow(2)]).map((row) => row.lineNumber)).toEqual([1, 2]);
  });
});

describe('the filter', () => {
  const rows = [
    resolveRow(
      importRow(1, {
        fullName: 'joey holland',
        linkedinUsername: 'joeyholland',
        outcome: importOutcome({ status: 'new' }),
      }),
    ),
    resolveRow(
      importRow(2, {
        fullName: 'ada lovelace',
        linkedinUsername: 'adalovelace',
        outcome: importOutcome({ status: 'updated', scrambled: true }),
      }),
    ),
    resolveRow(rejectedRow(3, 'junk_line', '/mnt/dump')),
  ];

  it('is inert until something is set', () => {
    expect(isFiltered(NO_FILTER)).toBe(false);
    expect(filterRows(rows, NO_FILTER)).toHaveLength(3);
  });

  it('notices each kind of filter on its own', () => {
    expect(isFiltered({ ...NO_FILTER, text: 'ada' })).toBe(true);
    expect(isFiltered({ ...NO_FILTER, text: '   ' })).toBe(false);
    expect(isFiltered({ ...NO_FILTER, statuses: ['new'] })).toBe(true);
    expect(isFiltered({ ...NO_FILTER, scrambled: true })).toBe(true);
    expect(isFiltered({ ...NO_FILTER, duplicate: true })).toBe(true);
  });

  it('matches any of the chosen statuses', () => {
    const filtered = filterRows(rows, { ...NO_FILTER, statuses: ['new', 'rejected'] });

    expect(filtered.map((row) => row.lineNumber)).toEqual([1, 3]);
  });

  it('narrows on every word typed, not just the first', () => {
    expect(filterRows(rows, { ...NO_FILTER, text: 'lovelace' })).toHaveLength(1);
    // Both words have to appear in the same row, and no row holds both names.
    expect(filterRows(rows, { ...NO_FILTER, text: 'lovelace holland' })).toHaveLength(0);
  });

  it('keeps only scrambled rows, or only duplicates, when asked', () => {
    expect(filterRows(rows, { ...NO_FILTER, scrambled: true }).map((r) => r.lineNumber)).toEqual([2]);
    expect(filterRows(rows, { ...NO_FILTER, duplicate: true })).toHaveLength(0);
  });

  it('combines facets with AND', () => {
    expect(matchesFilter(rows[1], { ...NO_FILTER, statuses: ['updated'], scrambled: true })).toBe(true);
    expect(matchesFilter(rows[1], { ...NO_FILTER, statuses: ['new'], scrambled: true })).toBe(false);
  });

  it('adds and removes one status without disturbing the rest', () => {
    const one = toggleStatus(NO_FILTER, 'new');
    const two = toggleStatus(one, 'rejected');

    expect(two.statuses).toEqual(['new', 'rejected']);
    expect(toggleStatus(two, 'new').statuses).toEqual(['rejected']);
  });
});

describe('the sort', () => {
  const rows = [
    resolveRow(importRow(3, { fullName: 'carol', outcome: importOutcome({ qualityScore: 0.5 }) })),
    resolveRow(importRow(1, { fullName: 'alice', outcome: importOutcome({ qualityScore: 0.9 }) })),
    resolveRow(importRow(2, { fullName: 'bob', outcome: importOutcome({ qualityScore: 0.5 }) })),
  ];

  it('orders by line number by default', () => {
    expect(sortRows(rows, DEFAULT_SORT).map((row) => row.lineNumber)).toEqual([1, 2, 3]);
  });

  it('orders by name, in both directions', () => {
    expect(sortRows(rows, { key: 'name', direction: 'asc' }).map((r) => r.name)).toEqual([
      'Alice',
      'Bob',
      'Carol',
    ]);
    expect(sortRows(rows, { key: 'name', direction: 'desc' }).map((r) => r.name)).toEqual([
      'Carol',
      'Bob',
      'Alice',
    ]);
  });

  it('breaks a tie on the line number, so the order never depends on the input order', () => {
    const sorted = sortRows(rows, { key: 'quality', direction: 'asc' });

    expect(sorted.map((row) => row.lineNumber)).toEqual([2, 3, 1]);
  });

  it('starts a new column ascending and flips the one already sorting', () => {
    expect(nextSort(DEFAULT_SORT, 'name')).toEqual({ key: 'name', direction: 'asc' });
    expect(nextSort({ key: 'name', direction: 'asc' }, 'name')).toEqual({
      key: 'name',
      direction: 'desc',
    });
    expect(nextSort({ key: 'name', direction: 'desc' }, 'name')).toEqual({
      key: 'name',
      direction: 'asc',
    });
  });
});

/**
 * The two policies are read from the same preview: nothing is re-fetched when the toggle moves, so
 * the whole difference between "as parsed" and "realigned" lives in these two functions.
 */
describe('the repair policy in force', () => {
  const scrambled = importRow(7, {
    outcome: importOutcome({ status: 'unchanged', scrambled: true, qualityScore: 0.41 }),
    withRepair: importOutcome({ status: 'new', realigned: true, offset: -1, qualityScore: 0.88 }),
  });

  describe('outcomeUnder', () => {
    it('reads the row as it parsed when the repair is off', () => {
      expect(outcomeUnder(scrambled, false)).toEqual(scrambled.outcome);
    });

    it('reads the repaired verdict when the repair is on', () => {
      expect(outcomeUnder(scrambled, true)).toEqual(scrambled.withRepair);
    });

    it('keeps the one verdict when the repair changes nothing for that row', () => {
      const settled = importRow(8, { outcome: importOutcome({ status: 'new' }) });

      expect(outcomeUnder(settled, true)).toEqual(settled.outcome);
    });
  });

  describe('resolveRows', () => {
    it('carries the policy down to every row it reads', () => {
      const [asParsed] = resolveRows([scrambled], false);
      const [realigned] = resolveRows([scrambled], true);

      expect(asParsed.status).toBe('unchanged');
      expect(asParsed.scrambled).toBe(true);
      expect(realigned.status).toBe('new');
      expect(realigned.realigned).toBe(true);
      expect(realigned.offset).toBe(-1);
    });
  });

  describe('countsUnder', () => {
    it('gives the plain counts when the repair is off', () => {
      const preview = importPreview();

      expect(countsUnder(preview, false)).toEqual(preview.counts);
    });

    it('overlays what realignment moves, and keeps what it cannot', () => {
      const preview = importPreview();

      const counts = countsUnder(preview, true);

      // Moved by the repair:
      expect(counts.realignedRows).toBe(preview.countsWithRepair.realignedRows);
      expect(counts.scrambledRows).toBe(preview.countsWithRepair.scrambledRows);
      expect(counts.fieldsQuarantined).toBe(preview.countsWithRepair.fieldsQuarantined);
      // Beyond its reach, so taken from the plain counts:
      expect(counts.rowsTotal).toBe(preview.counts.rowsTotal);
      expect(counts.rowsRejected).toBe(preview.counts.rowsRejected);
      expect(counts.duplicatesCollapsed).toBe(preview.counts.duplicatesCollapsed);
    });
  });
});
