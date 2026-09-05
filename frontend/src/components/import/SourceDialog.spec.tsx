/**
 * The dialog that shows what the uploaded file actually said on one line. It is the only screen
 * that renders raw source, so it has to tell a blank cell, a quarantined one and a refused line
 * apart, and it has to behave like a modal: focus trapped, Escape closes, the page behind held.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ImportRowSource, SourceColumn, SourceRow } from '@/types/api';
import { renderApp } from '@/test';
import { resolveRow } from './preview-rows';
import { importRow, rejectedRow } from '@/test/fixtures';
import { SourceDialog } from './SourceDialog';
import type { RowSourceState } from './use-row-source';

function column(overrides: Partial<SourceColumn> = {}): SourceColumn {
  return { index: 0, column: 'full_name', value: 'joey holland', target: 'person.fullName', verdict: 'kept', ...overrides };
}

function line(overrides: Partial<SourceRow> = {}): SourceRow {
  return {
    lineNumber: 4,
    raw: 'joey holland,joey,holland,male',
    rawTruncated: false,
    fieldCount: 77,
    expectedFieldCount: 77,
    recovered: false,
    droppedFields: [],
    accepted: true,
    scrambled: false,
    identity: { linkedinUsername: 'joeyholland', linkedinUrl: 'linkedin.com/in/joeyholland', fullName: 'joey holland' },
    columns: [column()],
    ...overrides,
  };
}

function source(overrides: Partial<SourceRow> = {}): ImportRowSource {
  return { importId: 'run-1', filename: 'export.csv', line: line(overrides) };
}

function show(state: RowSourceState, row = resolveRow(importRow(4))) {
  const onClose = vi.fn();
  const onRetry = vi.fn();
  renderApp(<SourceDialog row={row} state={state} onClose={onClose} onRetry={onRetry} />);
  return { onClose, onRetry };
}

const ready = (overrides: Partial<SourceRow> = {}): RowSourceState => ({
  status: 'ready',
  source: source(overrides),
});

describe('SourceDialog', () => {
  it('names the line and the person it belongs to', () => {
    show(ready());

    expect(screen.getByRole('dialog')).toHaveAccessibleName(/Line 4/);
  });

  it('shows the raw line exactly as the file held it', () => {
    show(ready());

    expect(screen.getByText('joey holland,joey,holland,male')).toBeInTheDocument();
  });

  it('says when the API sent only the start of a very long line', () => {
    show(ready({ rawTruncated: true }));

    expect(screen.getByText(/the API sent the start of it/)).toBeInTheDocument();
  });

  it('lists each column with its position, its value and what became of it', () => {
    show(ready());

    const row = screen.getByText('full_name').closest('tr') as HTMLElement;
    expect(within(row).getByText('joey holland')).toBeInTheDocument();
    expect(within(row).getByText(/Kept/)).toHaveTextContent('as person.fullName');
  });

  it('tells the five verdicts apart, so a blank cell never reads as a dropped one', () => {
    show(
      ready({
        columns: [
          column({ index: 0, column: 'a', verdict: 'kept', target: 'person.fullName' }),
          column({ index: 1, column: 'twitter_username', verdict: 'quarantined', reason: 'looks like a phone number' }),
          column({ index: 2, column: 'summary', value: '', verdict: 'empty' }),
          column({ index: 3, column: 'version_status', verdict: 'unmapped' }),
          column({ index: 4, column: 'skills', verdict: 'unread' }),
        ],
      }),
    );

    expect(screen.getByText(/Quarantined/)).toHaveTextContent('looks like a phone number');
    expect(screen.getByText('Blank in the file')).toBeInTheDocument();
    expect(screen.getByText('No field behind this column')).toBeInTheDocument();
    expect(screen.getByText('Not read: the line was refused first')).toBeInTheDocument();
  });

  it('marks a field that ran past the end of the header', () => {
    show(ready({ columns: [column({ index: 78, column: undefined, verdict: 'unmapped' })] }));

    expect(screen.getByText('past the header')).toBeInTheDocument();
  });

  it('says so when the reader could not split the line into columns at all', () => {
    show(ready({ columns: [] }));

    expect(screen.getByText(/could not split this line into columns/)).toBeInTheDocument();
  });

  it('explains a line that parsed to the wrong width', () => {
    show(ready({ fieldCount: 61, expectedFieldCount: 77 }));

    expect(screen.getByText(/It split into 61 fields where/)).toBeInTheDocument();
  });

  it('shows the prefix a recovered line lost, so the artifact is visible', () => {
    show(ready({ recovered: true, droppedFields: ['/mnt/dump', 'part-0001'] }));

    expect(screen.getByText(/2 fields were dropped/)).toBeInTheDocument();
    expect(screen.getByText('/mnt/dump | part-0001')).toBeInTheDocument();
  });

  it('leaves the shape section out for a clean, full-width line', () => {
    show(ready());

    expect(screen.queryByText('How the line parsed')).not.toBeInTheDocument();
  });

  it('says why a refused line was refused, in words and in its code', () => {
    show(
      ready({
        accepted: false,
        identity: undefined,
        rejection: { reason: 'junk_line', label: 'Junk line', detail: 'a path into the source dump opens the line' },
      }),
      resolveRow(rejectedRow(9, 'junk_line', '/mnt/dump')),
    );

    expect(screen.getByText('Why the line was refused')).toBeInTheDocument();
    expect(screen.getByText('(junk_line)')).toBeInTheDocument();
    expect(screen.getByText('a path into the source dump opens the line')).toBeInTheDocument();
  });

  describe('while it is loading or failed', () => {
    it('announces that it is reading the line', () => {
      show({ status: 'loading' });

      expect(screen.getByRole('status')).toHaveTextContent('Reading line 4 from the file');
    });

    it('offers a retry when the read failed, and names what failed', async () => {
      const { onRetry } = show({ status: 'error', error: new Error('the API did not answer') });

      expect(screen.getByText('The source line did not load')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(onRetry).toHaveBeenCalled();
    });
  });

  describe('as a modal', () => {
    it('moves focus to the close button and closes on it', async () => {
      const { onClose } = show(ready());

      expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(onClose).toHaveBeenCalled();
    });

    it('closes on Escape', async () => {
      const { onClose } = show(ready());

      await userEvent.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalled();
    });

    it('closes on a click outside the panel, but not on one inside it', async () => {
      const { onClose } = show(ready());

      await userEvent.click(screen.getByRole('dialog'));
      expect(onClose).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);
      expect(onClose).toHaveBeenCalled();
    });

    it('keeps Tab inside the panel, in both directions', async () => {
      show(ready());
      const close = screen.getByRole('button', { name: 'Close' });

      // Only one focusable element here, so the trap must land back on it either way.
      await userEvent.tab();
      expect(close).toHaveFocus();

      await userEvent.tab({ shift: true });
      expect(close).toHaveFocus();
    });

    it('lets Tab move normally while focus is not yet on the last element', async () => {
      // The error state adds a second focusable control, so the first Tab is an ordinary one.
      show({ status: 'error', error: new Error('nope') });

      expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
      await userEvent.tab();

      expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus();
    });

    it('holds the page behind still, and lets it scroll again once closed', () => {
      const { unmount } = renderApp(
        <SourceDialog row={resolveRow(importRow(4))} state={ready()} onClose={vi.fn()} onRetry={vi.fn()} />,
      );

      expect(document.body.style.overflow).toBe('hidden');
      unmount();
      expect(document.body.style.overflow).not.toBe('hidden');
    });
  });
});
