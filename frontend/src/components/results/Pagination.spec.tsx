/** Paging over a result set, with a window that never grows past a handful of numbers. */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '@/test';
import { Pagination } from './Pagination';

function show(page: number, total: number, size = 20) {
  const onPageChange = vi.fn();
  const view = renderApp(
    <Pagination page={page} size={size} total={total} onPageChange={onPageChange} />,
  );
  return { ...view, onPageChange };
}

describe('Pagination', () => {
  it('shows nothing when everything fits on one page', () => {
    const { container } = show(1, 12);

    expect(container).toBeEmptyDOMElement();
  });

  it('marks the page the reader is on', () => {
    show(2, 100);

    expect(screen.getByRole('button', { current: 'page' })).toHaveTextContent('2');
  });

  it('walks forwards and backwards', async () => {
    const { onPageChange } = show(2, 100);

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('jumps to a numbered page', async () => {
    const { onPageChange } = show(1, 100);

    // The window holds the first, the last, and the pages either side of the current one.
    await userEvent.click(screen.getByRole('button', { name: '5' }));

    expect(onPageChange).toHaveBeenCalledWith(5);
  });

  it('stops at both ends', () => {
    show(1, 100);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    show(5, 100);
    expect(screen.getAllByRole('button', { name: 'Next' })[1]).toBeDisabled();
  });

  it('elides the pages it is not showing', () => {
    show(10, 1000);

    expect(screen.getAllByText('…').length).toBeGreaterThan(0);
  });

  it('says which page of how many, for a narrow screen', () => {
    show(2, 100);

    expect(screen.getByText(/Page 2 of 5/)).toBeInTheDocument();
  });

  it('clamps a page number past the end rather than showing an empty window', () => {
    show(99, 100);

    expect(screen.getByRole('button', { current: 'page' })).toHaveTextContent('5');
  });
});
