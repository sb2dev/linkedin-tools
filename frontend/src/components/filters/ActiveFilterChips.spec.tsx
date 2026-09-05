/** The chips that say what is filtering the results right now, and let each one be undone. */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FilterState } from '@/types/api';
import { renderApp } from '@/test';
import { fieldNamed, searchSchema } from '@/test/fixtures';
import { ActiveFilterChips, describeFilter } from './ActiveFilterChips';

function show(filters: FilterState) {
  const onChange = vi.fn();
  const onClearAll = vi.fn();
  const onOpenChange = vi.fn();
  renderApp(
    <ActiveFilterChips
      fields={searchSchema().fields}
      filters={filters}
      facets={new Map()}
      openId={null}
      onOpenChange={onOpenChange}
      onChange={onChange}
      onClearAll={onClearAll}
    />,
  );
  return { onChange, onClearAll, onOpenChange };
}

describe('describeFilter', () => {
  it('reads an exists filter as yes or no, not as present or absent', () => {
    expect(describeFilter(fieldNamed('hasTwitter'), { type: 'exists', present: true })).toBe(
      'Has Twitter: yes',
    );
    expect(describeFilter(fieldNamed('hasTwitter'), { type: 'exists', present: false })).toBe(
      'Has Twitter: no',
    );
  });

  it('reads a range as its bounds', () => {
    expect(describeFilter(fieldNamed('yearsExperience'), { type: 'range', min: 5, max: 15 })).toContain(
      '5',
    );
  });

  it('lists a few terms and counts the rest', () => {
    const many = { type: 'terms' as const, values: ['a', 'b', 'c', 'd', 'e'] };

    expect(describeFilter(fieldNamed('skills'), many)).toMatch(/\+\d$/);
  });

  it('lists every term when there are only a few', () => {
    expect(describeFilter(fieldNamed('skills'), { type: 'terms', values: ['a'] })).toBe('Skills: A');
  });
});

describe('ActiveFilterChips', () => {
  it('shows nothing at all when no filter is on', () => {
    const { container } = renderApp(
      <ActiveFilterChips
        fields={searchSchema().fields}
        filters={{}}
        facets={new Map()}
        openId={null}
        onOpenChange={vi.fn()}
        onChange={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows one chip per active filter', () => {
    show({
      skills: { type: 'terms', values: ['leadership'] },
      country: { type: 'terms', values: ['united states'] },
    });

    expect(screen.getByText(/Skills: Leadership/)).toBeInTheDocument();
    expect(screen.getByText(/Country: United States/)).toBeInTheDocument();
  });

  it('drops one filter from its chip', async () => {
    const { onChange } = show({ skills: { type: 'terms', values: ['leadership'] } });

    await userEvent.click(screen.getByRole('button', { name: /Remove/ }));

    expect(onChange).toHaveBeenCalledWith('skills', undefined);
  });

  it('clears them all at once', async () => {
    const { onClearAll } = show({
      skills: { type: 'terms', values: ['a'] },
      country: { type: 'terms', values: ['b'] },
    });

    await userEvent.click(screen.getByRole('button', { name: /Clear all/i }));

    expect(onClearAll).toHaveBeenCalled();
  });

  it('ignores a filter key the schema does not know', () => {
    show({ notAField: { type: 'terms', values: ['x'] } });

    expect(screen.queryByText(/notAField/)).not.toBeInTheDocument();
  });
});
