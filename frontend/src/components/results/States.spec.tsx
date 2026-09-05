/** What the results area shows when there is nothing to show, or when the search failed. */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type FilterState, type SearchQuery } from '@/types/api';
import { renderApp } from '@/test';
import { searchSchema } from '@/test/fixtures';
import { EmptyState, ErrorState } from './States';

function query(filters: FilterState = {}, q = ''): SearchQuery {
  return { q, sort: 'relevance', page: 1, size: 20, facets: [], filters };
}

function showEmpty(filters: FilterState = {}, q = '') {
  const onRemoveFilter = vi.fn();
  const onClearFilters = vi.fn();
  const onClearKeywords = vi.fn();
  renderApp(
    <EmptyState
      query={query(filters, q)}
      schema={searchSchema()}
      onRemoveFilter={onRemoveFilter}
      onClearFilters={onClearFilters}
      onClearKeywords={onClearKeywords}
    />,
  );
  return { onRemoveFilter, onClearFilters, onClearKeywords };
}

describe('EmptyState', () => {
  it('says the index is empty when nothing has been searched for', () => {
    showEmpty();

    expect(screen.getByText(/no profiles yet/i)).toBeInTheDocument();
  });

  it('offers to clear the keywords when only they narrowed it', async () => {
    const { onClearKeywords } = showEmpty({}, 'zzzz');

    expect(screen.getByText(/Nothing matched/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear keywords' }));
    expect(onClearKeywords).toHaveBeenCalled();
  });

  it('names the narrowest filter and offers to drop it', async () => {
    const { onRemoveFilter } = showEmpty({
      country: { type: 'terms', values: ['atlantis'] },
    });

    expect(screen.getByText(/The active filter/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Remove Country/ }));
    expect(onRemoveFilter).toHaveBeenCalledWith('country');
  });

  it('counts the filters and offers to clear them all when there are several', async () => {
    const { onClearFilters } = showEmpty({
      country: { type: 'terms', values: ['atlantis'] },
      hasTwitter: { type: 'exists', present: true },
    });

    expect(screen.getByText(/2 filters are active/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(onClearFilters).toHaveBeenCalled();
  });

  it('ranks a closed range above an open one, and a wide list below a single term', () => {
    showEmpty({
      connections: { type: 'range', min: 1, max: 2 },
      graduationYear: { type: 'date_range', from: '2000' },
      hasTwitter: { type: 'exists', present: true },
    });

    expect(screen.getByRole('button', { name: /Remove Connections/ })).toBeInTheDocument();
  });

  it('ranks an open-ended range above a yes/no, but below a closed one', () => {
    showEmpty({
      connections: { type: 'range', min: 500 },
      hasTwitter: { type: 'exists', present: true },
    });

    expect(screen.getByRole('button', { name: /Remove Connections/ })).toBeInTheDocument();
  });

  it('ranks a closed date range highest when it is the tightest', () => {
    showEmpty({
      graduationYear: { type: 'date_range', from: '2000', to: '2001' },
      hasTwitter: { type: 'exists', present: true },
    });

    expect(screen.getByRole('button', { name: /Remove Graduated/ })).toBeInTheDocument();
  });

  it('ranks a single required term above a wide list of alternatives', () => {
    showEmpty({
      country: { type: 'terms', values: ['atlantis'] },
      skills: { type: 'terms', values: ['a', 'b', 'c', 'd'] },
    });

    expect(screen.getByRole('button', { name: /Remove Country/ })).toBeInTheDocument();
  });

  it('falls back to the filter key when the schema does not name it', () => {
    showEmpty({ mysteryField: { type: 'terms', values: ['x'] } });

    expect(screen.getByRole('button', { name: /Remove mysteryField/ })).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('reads a plain error', () => {
    renderApp(<ErrorState error={new Error('it broke')} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByText('it broke')).toBeInTheDocument();
  });

  it('prefers the title the caller gave', () => {
    renderApp(<ErrorState error={new Error('x')} title="The search failed" />);

    expect(screen.getByText('The search failed')).toBeInTheDocument();
  });

  it('reads the problem document the API sent', () => {
    const error = new ApiError({
      type: 'about:blank',
      title: 'Bad request',
      status: 400,
      detail: 'the filter was malformed',
    });
    renderApp(<ErrorState error={error} />);

    expect(screen.getByText('Bad request')).toBeInTheDocument();
    expect(screen.getByText('the filter was malformed')).toBeInTheDocument();
  });

  it('lists the fields the API named', () => {
    const error = new ApiError({
      type: 'about:blank',
      title: 'Bad request',
      status: 400,
      detail: 'invalid',
      errors: { size: ['size must not exceed 100'] },
    });
    renderApp(<ErrorState error={error} />);

    expect(screen.getByText('size')).toBeInTheDocument();
    expect(screen.getByText(/size must not exceed 100/)).toBeInTheDocument();
  });

  it('tells the reader how to bring the API back when it is unreachable', () => {
    const error = new ApiError({ type: 'about:blank', title: 'Cannot reach the API', status: 0, detail: '' });
    renderApp(<ErrorState error={error} />);

    expect(screen.getByText(/Start the API on port 3100/)).toBeInTheDocument();
  });

  it('offers a retry only when the caller gave one', async () => {
    const onRetry = vi.fn();
    const { rerender } = renderApp(<ErrorState error={new Error('x')} />);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();

    rerender(<ErrorState error={new Error('x')} onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
