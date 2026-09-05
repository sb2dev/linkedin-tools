/** The three small controls: a tri-state toggle, ordered chips, and a pair of year boxes. */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FilterValue } from '@/types/api';
import { renderApp } from '@/test';
import { facet, fieldNamed } from '@/test/fixtures';
import { DateRangeControl } from './DateRangeControl';
import { ExistsControl } from './ExistsControl';
import { OrderedTermsControl } from './OrderedTermsControl';

describe('ExistsControl', () => {
  function show(value?: FilterValue) {
    const onChange = vi.fn();
    renderApp(<ExistsControl field={fieldNamed('hasTwitter')} value={value} onChange={onChange} />);
    return { onChange };
  }

  it('starts on "any" when nothing is filtering', () => {
    show();

    expect(screen.getByRole('radio', { name: 'Any' })).toBeChecked();
  });

  it('reads an existing filter back onto the right choice', () => {
    show({ type: 'exists', present: true });
    expect(screen.getByRole('radio', { name: 'Has it' })).toBeChecked();
  });

  it('reads the negative side too', () => {
    show({ type: 'exists', present: false });
    expect(screen.getByRole('radio', { name: 'Does not have it' })).toBeChecked();
  });

  it('filters for present and for absent', async () => {
    const { onChange } = show();

    await userEvent.click(screen.getByRole('radio', { name: 'Has it' }));
    expect(onChange).toHaveBeenCalledWith({ type: 'exists', present: true });

    await userEvent.click(screen.getByRole('radio', { name: 'Does not have it' }));
    expect(onChange).toHaveBeenCalledWith({ type: 'exists', present: false });
  });

  it('drops the filter entirely on "any"', async () => {
    const { onChange } = show({ type: 'exists', present: true });

    await userEvent.click(screen.getByRole('radio', { name: 'Any' }));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe('OrderedTermsControl', () => {
  function show(value?: FilterValue, withFacet = true) {
    const onChange = vi.fn();
    renderApp(
      <OrderedTermsControl
        field={fieldNamed('seniority')}
        value={value}
        facet={withFacet ? facet('seniority', [['manager', 16]]) : undefined}
        onChange={onChange}
      />,
    );
    return { onChange };
  }

  it('shows the vocabulary in its own order, not by count', () => {
    show();

    const chips = screen.getAllByRole('button').map((chip) => chip.textContent ?? '');
    // The registry order, lowercased as the corpus holds it, not the facet's count order.
    expect(chips[0]).toContain('unpaid');
    expect(chips.at(-1)).toContain('owner');
  });

  it('shows no count for a level the facet never reached', () => {
    show();

    expect(screen.getByRole('button', { name: 'director' })).toHaveTextContent(/^director$/);
  });

  it('shows a count beside the levels the facet reached', () => {
    show();

    expect(screen.getByRole('button', { name: /manager/i })).toHaveTextContent('16');
  });

  it('dims a level the current result reached zero of', () => {
    renderApp(
      <OrderedTermsControl
        field={fieldNamed('seniority')}
        value={undefined}
        facet={facet('seniority', [['director', 0], ['manager', 16]])}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /^director/ }).className).toContain('text-muted');
  });

  it('picks a level and unpicks it again', async () => {
    const { onChange } = show();

    await userEvent.click(screen.getByRole('button', { name: /director/i }));
    expect(onChange).toHaveBeenCalledWith({ type: 'terms', values: ['director'] });
  });

  it('drops the filter when the last level is unpicked', async () => {
    const { onChange } = show({ type: 'terms', values: ['manager'] });

    await userEvent.click(screen.getByRole('button', { name: /manager/i }));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('keeps a picked value the vocabulary does not declare', () => {
    show({ type: 'terms', values: ['emeritus'] });

    expect(screen.getByRole('button', { name: /emeritus/i })).toBeInTheDocument();
  });

  it('reads the counts from a facet that returned none at all', () => {
    renderApp(
      <OrderedTermsControl
        field={fieldNamed('seniority')}
        value={undefined}
        facet={undefined}
        onChange={vi.fn()}
      />,
    );

    // The whole ladder is still offered; none of it carries a number.
    expect(screen.getByRole('button', { name: 'manager' })).toBeInTheDocument();
  });

  it('says so when there is neither a vocabulary nor a facet to offer', () => {
    renderApp(
      <OrderedTermsControl
        field={{ ...fieldNamed('seniority'), options: [] }}
        value={undefined}
        facet={undefined}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('No values available.')).toBeInTheDocument();
  });

  it('falls back to the facet when the field declares no vocabulary', () => {
    const onChange = vi.fn();
    renderApp(
      <OrderedTermsControl
        field={{ ...fieldNamed('seniority'), options: undefined }}
        value={undefined}
        facet={facet('seniority', [['manager', 16]])}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('button', { name: /manager/i })).toBeInTheDocument();
  });
});

describe('DateRangeControl', () => {
  function show(value?: FilterValue) {
    const onChange = vi.fn();
    renderApp(<DateRangeControl field={fieldNamed('graduationYear')} value={value} onChange={onChange} />);
    return { onChange };
  }

  it('starts empty', () => {
    show();

    const [from, to] = screen.getAllByRole('textbox');
    expect(from).toHaveValue('');
    expect(to).toHaveValue('');
  });

  it('says so when a bound is not a date the API would accept', () => {
    show({ type: 'date_range', from: 'last year' });

    expect(screen.getByText(/Use a year, or yyyy-MM/)).toBeInTheDocument();
  });

  it('reads an existing range back into the boxes', () => {
    show({ type: 'date_range', from: '2000', to: '2010' });

    const [from, to] = screen.getAllByRole('textbox');
    expect(from).toHaveValue('2000');
    expect(to).toHaveValue('2010');
  });

  it('filters on one end alone', async () => {
    const { onChange } = show();

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '2000' } });

    expect(onChange).toHaveBeenLastCalledWith({ type: 'date_range', from: '2000' });
  });

  it('filters on the other end alone', async () => {
    const { onChange } = show();

    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: '2010' } });

    expect(onChange).toHaveBeenLastCalledWith({ type: 'date_range', to: '2010' });
  });

  it('drops the filter when both ends are cleared', async () => {
    const { onChange } = show({ type: 'date_range', from: '2000' });

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '' } });

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
