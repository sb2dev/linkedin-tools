/** The chip row over the preview table: OR within the statuses, AND across the flags. */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '@/test';
import { NO_FILTER, type RowFilter } from './preview-rows';
import { PreviewFilters } from './PreviewFilters';

const COUNTS = {
  statuses: { new: 5, updated: 3, unchanged: 2, duplicate: 1, rejected: 4 },
  scrambled: 6,
  duplicate: 0,
};

function show(filter: RowFilter = NO_FILTER, counts = COUNTS) {
  const onChange = vi.fn();
  renderApp(
    <PreviewFilters filter={filter} onChange={onChange} counts={counts} shown={10} total={15} />,
  );
  return { onChange };
}

describe('PreviewFilters', () => {
  it('shows a chip per status with the rows it would select', () => {
    show();

    expect(screen.getByRole('button', { name: /New 5/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rejected 4/ })).toBeInTheDocument();
  });

  it('adds a status to the filter, and takes it away again', async () => {
    const { onChange } = show();

    await userEvent.click(screen.getByRole('button', { name: /New 5/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ statuses: ['new'] }));
  });

  it('marks the chips already pressed', () => {
    show({ ...NO_FILTER, statuses: ['new'] });

    expect(screen.getByRole('button', { name: /New 5/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Rejected 4/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('disables a chip that would select nothing', () => {
    show();

    expect(screen.getByRole('button', { name: /In a duplicate pair 0/ })).toBeDisabled();
  });

  it('leaves a pressed chip usable even at zero, so it can be unpressed', () => {
    show({ ...NO_FILTER, duplicate: true });

    expect(screen.getByRole('button', { name: /In a duplicate pair 0/ })).toBeEnabled();
  });

  it('toggles the scrambled flag', async () => {
    const { onChange } = show();

    await userEvent.click(screen.getByRole('button', { name: /Scrambled 6/ }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ scrambled: true }));
  });

  it('toggles the duplicate flag', async () => {
    const { onChange } = show(NO_FILTER, { ...COUNTS, duplicate: 3 });

    await userEvent.click(screen.getByRole('button', { name: /In a duplicate pair 3/ }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ duplicate: true }));
  });

  it('offers no clear while nothing is filtering', () => {
    show();

    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('clears everything once something is', async () => {
    const { onChange } = show({ ...NO_FILTER, scrambled: true });

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onChange).toHaveBeenCalledWith(NO_FILTER);
  });

  it('passes the typed search through to the filter', async () => {
    const { onChange } = show();

    await userEvent.type(screen.getByRole('searchbox'), 'h');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ text: 'h' }));
  });

  it('says how many rows are showing, for a reader who cannot see the table', () => {
    show();

    expect(screen.getByRole('status')).toHaveTextContent('Showing 10 of 15 rows');
  });
});
