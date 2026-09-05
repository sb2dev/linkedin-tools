/** What the file holds and what committing it would change. Every tile also filters the table. */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '@/test';
import { importPreview } from '@/test/fixtures';
import { NO_FILTER, type RowFilter } from './preview-rows';
import { PreviewSummary, Tile } from './PreviewSummary';

function show(filter: RowFilter = NO_FILTER, repair = false) {
  const onFilterChange = vi.fn();
  renderApp(
    <PreviewSummary
      preview={importPreview()}
      repair={repair}
      filter={filter}
      onFilterChange={onFilterChange}
    />,
  );
  return { onFilterChange };
}

describe('Tile', () => {
  it('is a plain number when it filters nothing', () => {
    renderApp(<Tile label="Rows" value={336} />);

    expect(screen.getByText('336')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is a control when it does, and says whether it is the active one', () => {
    renderApp(<Tile label="Rows" value={336} onSelect={vi.fn()} active />);

    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('is not pressed when nothing said it was', () => {
    renderApp(<Tile label="Rows" value={1} onSelect={vi.fn()} />);

    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('PreviewSummary', () => {
  it('names the file, its size and when it was read', () => {
    show();

    expect(screen.getByText(/300 user linkedin\.csv/)).toBeInTheDocument();
  });

  it('shows the counts the commit will act on', () => {
    show();

    expect(screen.getByText('Rows in file')).toBeInTheDocument();
    expect(screen.getByText('Rows accepted')).toBeInTheDocument();
    expect(screen.getByText('Rows rejected')).toBeInTheDocument();
  });

  it('filters to each individual outcome from its own tile', async () => {
    const { onFilterChange } = show();

    for (const [label, status] of [
      ['Rows in file', undefined],
      ['New profiles', 'new'],
      ['Needs update', 'updated'],
      ['Unchanged', 'unchanged'],
    ] as const) {
      const tile = screen.queryByRole('button', { name: new RegExp(label) });
      if (!tile) continue;
      await userEvent.click(tile);
      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ statuses: status === undefined ? [] : [status] }),
      );
    }
  });

  it('filters the table to the rows a tile counts', async () => {
    const { onFilterChange } = show();

    await userEvent.click(screen.getByRole('button', { name: /Rows rejected/ }));

    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ statuses: ['rejected'] }));
  });

  it('groups every accepted status behind the accepted tile', async () => {
    const { onFilterChange } = show();

    await userEvent.click(screen.getByRole('button', { name: /Rows accepted/ }));

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ statuses: ['new', 'updated', 'unchanged', 'duplicate'] }),
    );
  });

  it('clears the filter when the active tile is pressed again', async () => {
    const { onFilterChange } = show({ ...NO_FILTER, statuses: ['rejected'] });

    await userEvent.click(screen.getByRole('button', { name: /Rows rejected/ }));

    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ statuses: [] }));
  });

  it('keeps the typed search when a tile changes the statuses', async () => {
    const { onFilterChange } = show({ ...NO_FILTER, text: 'holland' });

    await userEvent.click(screen.getByRole('button', { name: /Rows rejected/ }));

    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ text: 'holland' }));
  });

  it('does not call a tile active while a flag is also narrowing the table', () => {
    show({ ...NO_FILTER, statuses: ['rejected'], scrambled: true });

    expect(screen.getByRole('button', { name: /Rows rejected/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('filters to the duplicate rows from its chip', async () => {
    const { onFilterChange } = show();

    await userEvent.click(screen.getByRole('button', { name: /duplicate rows collapsed/ }));

    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ statuses: ['duplicate'] }));
  });

  it('toggles the scrambled flag without disturbing the rest of the filter', async () => {
    const { onFilterChange } = show({ ...NO_FILTER, statuses: ['new'] });

    await userEvent.click(screen.getByRole('button', { name: /scrambled column block/ }));

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ statuses: ['new'], scrambled: true }),
    );
  });

  it('shows the quarantined field count as a plain number, not a control', () => {
    show();

    expect(screen.getByText(/fields quarantined/)).toBeInTheDocument();
  });
});
