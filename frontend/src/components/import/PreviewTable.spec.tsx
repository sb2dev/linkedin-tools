/**
 * Every line of the uploaded file, searchable and sortable. This is the screen an operator reads
 * before approving a write, so a row has to say what it will do and why it is unusual.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setAccessToken } from '@/api/client';
import { fakeFetch, jsonResponse, renderApp } from '@/test';
import { importOutcome, importRow, rejectedRow } from '@/test/fixtures';
import { NO_FILTER, type RowFilter } from './preview-rows';
import { PreviewTable } from './PreviewTable';

beforeEach(() => {
  setAccessToken('a-token');
  const fake = fakeFetch(() =>
    jsonResponse({
      importId: 'run-1',
      filename: 'export.csv',
      line: {
        lineNumber: 1,
        raw: 'the raw line',
        rawTruncated: false,
        fieldCount: 77,
        expectedFieldCount: 77,
        recovered: false,
        droppedFields: [],
        accepted: true,
        scrambled: false,
        columns: [],
      },
    }),
  );
  vi.stubGlobal('fetch', fake.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

/** `importRows(n)` appends seven fixed rows of its own, so a count-sensitive test builds its own. */
function plainRows(count: number) {
  return Array.from({ length: count }, (_unused, index) =>
    importRow(index + 1, { linkedinUsername: `person-${String(index)}`, fullName: `person ${String(index)}` }),
  );
}

function show(rows = plainRows(4), rowsOmitted = 0, filter: RowFilter = NO_FILTER, repair = false) {
  const onFilterChange = vi.fn();
  const view = renderApp(
    <PreviewTable
      importId="run-1"
      rows={rows}
      rowsOmitted={rowsOmitted}
      repair={repair}
      filter={filter}
      onFilterChange={onFilterChange}
    />,
  );
  return { ...view, onFilterChange };
}

describe('PreviewTable', () => {
  it('says so when the preview carries no rows at all', () => {
    show([]);

    expect(screen.getByText('This preview carries no rows')).toBeInTheDocument();
  });

  it('lists a row per line', () => {
    show(plainRows(3));

    expect(screen.getAllByRole('row')).toHaveLength(4); // one header + three rows
  });

  it('names what the row will do to the corpus', () => {
    show([importRow(1, { outcome: importOutcome({ status: 'new' }) })]);

    expect(screen.getAllByText('New').length).toBeGreaterThan(0);
  });

  it('shows a refused line with its reason and the text that opened it', () => {
    show([rejectedRow(9, 'JUNK_LINE', '/mnt/dump/part-0001')]);

    expect(screen.getAllByText('Junk line').length).toBeGreaterThan(0);
    expect(screen.getByText('/mnt/dump/part-0001')).toBeInTheDocument();
  });

  it('marks both sides of a duplicate pair', () => {
    show([
      importRow(1, { outcome: importOutcome({ duplicateRows: 2 }) }),
      importRow(2, { outcome: importOutcome({ status: 'duplicate', supersededByLine: 1 }) }),
    ]);

    expect(screen.getByText('+2 duplicate rows')).toBeInTheDocument();
    expect(screen.getByText('Same person as line 1')).toBeInTheDocument();
  });

  it('says how far a realigned row was moved, and marks one still scrambled', () => {
    show([
      importRow(1, { outcome: importOutcome({ realigned: true, offset: -3 }) }),
      importRow(2, { outcome: importOutcome({ realigned: true }) }),
      importRow(3, { outcome: importOutcome({ scrambled: true }) }),
    ]);

    expect(screen.getByText('Realigned by -3')).toBeInTheDocument();
    expect(screen.getByText('Realigned')).toBeInTheDocument();
    expect(screen.getAllByText('Scrambled').length).toBeGreaterThan(0);
  });

  it('shows the role and the place a row carries', () => {
    show([importRow(1, { jobTitle: 'recruiting manager', companyName: 'garver' })]);

    expect(screen.getAllByText('Recruiting Manager at Garver').length).toBeGreaterThan(0);
  });

  describe('sorting', () => {
    it('starts on the line number, ascending', () => {
      show(plainRows(3));

      expect(screen.getByRole('columnheader', { name: /Line/ })).toHaveAttribute('aria-sort', 'ascending');
    });

    it('sorts by a column, then flips it', async () => {
      show(plainRows(3));

      await userEvent.click(screen.getByRole('button', { name: /Name/ }));
      expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'ascending');

      await userEvent.click(screen.getByRole('button', { name: /Name/ }));
      expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'descending');
    });
  });

  describe('filtering', () => {
    it('says when nothing matched, and offers to clear', async () => {
      const { onFilterChange } = show(plainRows(3), 0, { ...NO_FILTER, text: 'nobody at all' });

      const notice = screen.getByText('No row matches these filters').closest('div') as HTMLElement;
      // The filter bar carries its own "Clear filters"; this one belongs to the empty notice.
      await userEvent.click(within(notice).getByRole('button', { name: 'Clear filters' }));
      expect(onFilterChange).toHaveBeenCalledWith(NO_FILTER);
    });

    it('goes back to the first page when the filter changes', async () => {
      const { onFilterChange } = show(plainRows(60));

      await userEvent.click(screen.getByRole('button', { name: /Next/ }));
      await userEvent.click(screen.getByRole('button', { name: /^New/ }));

      expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ statuses: ['new'] }));
    });

    it('reports how many of the rows are showing', () => {
      show(plainRows(4));

      expect(screen.getByRole('status')).toHaveTextContent('Showing 4 of 4 rows');
    });
  });

  it('falls back to a neutral tone for a refusal code it has no colour for', () => {
    show([rejectedRow(9, 'SOMETHING_NEW', 'an excerpt')]);

    expect(screen.getAllByText('SOMETHING_NEW').length).toBeGreaterThan(0);
  });

  it('says the count is a filtered one when a filter is on', () => {
    show(plainRows(3), 0, { ...NO_FILTER, statuses: ['new'] });

    expect(screen.getByText(/of 3 matching/)).toBeInTheDocument();
  });

  it('says how many rows the API counted but did not list', () => {
    show(plainRows(2), 300);

    expect(screen.getByText(/300 further rows are counted above/)).toBeInTheDocument();
  });

  it('pages a file larger than one screenful', async () => {
    show(plainRows(60));

    expect(screen.getAllByRole('row')).toHaveLength(51);
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getAllByRole('row')).toHaveLength(11);
  });

  it('opens the source of one line, and closes it again', async () => {
    show(plainRows(2));

    await userEvent.click(screen.getByRole('button', { name: 'Show the source of line 1' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('the raw line')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
