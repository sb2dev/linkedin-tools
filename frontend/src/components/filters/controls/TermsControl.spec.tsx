/** The multi-select over a facet's buckets, and the chip list of what is already picked. */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FilterValue } from '@/types/api';
import { renderApp } from '@/test';
import { facet, fieldNamed } from '@/test/fixtures';
import { SelectedTermList, TermsControl, selectedTerms, termsValue, toggleTerm } from './TermsControl';

describe('the term helpers', () => {
  it('reads the terms out of a filter, and nothing out of another kind', () => {
    expect(selectedTerms({ type: 'terms', values: ['a'] })).toEqual(['a']);
    expect(selectedTerms({ type: 'range', min: 1 })).toEqual([]);
    expect(selectedTerms(undefined)).toEqual([]);
  });

  it('drops the filter entirely when the last term is removed', () => {
    expect(termsValue(['a'])).toEqual({ type: 'terms', values: ['a'] });
    expect(termsValue([])).toBeUndefined();
  });

  it('adds a term that is missing and removes one that is there', () => {
    expect(toggleTerm(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleTerm(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('SelectedTermList', () => {
  it('shows nothing when nothing is picked', () => {
    const { container } = renderApp(<SelectedTermList values={[]} onRemove={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('removes the term it is asked to', async () => {
    const onRemove = vi.fn();
    renderApp(<SelectedTermList values={['leadership']} onRemove={onRemove} />);

    await userEvent.click(screen.getByRole('button', { name: /leadership/ }));

    expect(onRemove).toHaveBeenCalledWith('leadership');
  });
});

function show(value?: FilterValue) {
  const onChange = vi.fn();
  renderApp(
    <TermsControl
      field={fieldNamed('country')}
      value={value}
      facet={facet('country', [
        ['united states', 58],
        ['canada', 4],
      ])}
      onChange={onChange}
    />,
  );
  return { onChange };
}

describe('TermsControl', () => {
  it('lists the buckets with their counts', () => {
    show();

    expect(screen.getByRole('option', { name: /united states/ })).toHaveTextContent('58');
  });

  it('adds a value on click', async () => {
    const { onChange } = show();

    await userEvent.click(screen.getByRole('option', { name: /canada/ }));

    expect(onChange).toHaveBeenCalledWith({ type: 'terms', values: ['canada'] });
  });

  it('takes a value away again', async () => {
    const { onChange } = show({ type: 'terms', values: ['canada'] });

    await userEvent.click(screen.getByRole('option', { name: /canada/ }));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('narrows the list from the box inside the popover', async () => {
    show();

    await userEvent.type(screen.getByRole('combobox'), 'can');

    expect(screen.getByRole('option', { name: /canada/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /united states/ })).not.toBeInTheDocument();
  });

  describe('with the keyboard', () => {
    it('walks the options and picks the active one', async () => {
      const { onChange } = show();

      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.keyboard('{ArrowDown}{Enter}');

      expect(onChange).toHaveBeenCalledWith({ type: 'terms', values: ['canada'] });
    });

    it('wraps from the first option round to the last', async () => {
      const { onChange } = show();

      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.keyboard('{ArrowUp}{Enter}');

      expect(onChange).toHaveBeenCalledWith({ type: 'terms', values: ['canada'] });
    });

    it('adds the typed value when it is the row under the cursor', async () => {
      const { onChange } = show();

      await userEvent.type(screen.getByRole('combobox'), 'atlantis');
      await userEvent.keyboard('{Enter}');

      expect(onChange).toHaveBeenCalledWith({ type: 'terms', values: ['atlantis'] });
    });

    it('does nothing on Enter while there is no row to pick', async () => {
      const onChange = vi.fn();
      renderApp(
        <TermsControl field={fieldNamed('country')} value={undefined} facet={undefined} onChange={onChange} />,
      );

      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.keyboard('{ArrowDown}{Enter}');

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it('says so when the facet has no values and nothing is typed', () => {
    renderApp(
      <TermsControl field={fieldNamed('country')} value={undefined} facet={undefined} onChange={vi.fn()} />,
    );

    expect(screen.getByText(/No values for the current search/)).toBeInTheDocument();
  });

  it('offers a closed vocabulary the facet did not return, so a filter can still be picked', () => {
    renderApp(
      <TermsControl
        field={fieldNamed('seniority')}
        value={undefined}
        facet={facet('seniority', [['manager', 16]])}
        onChange={vi.fn()}
      />,
    );

    // The registry declares the whole ladder; the facet only listed the level anyone matched.
    expect(screen.getByRole('option', { name: /manager/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /director/ })).toBeInTheDocument();
  });

  it('keeps showing a value the reader picked even after the facet stopped listing it', () => {
    renderApp(
      <TermsControl
        field={fieldNamed('country')}
        value={{ type: 'terms', values: ['atlantis'] }}
        facet={facet('country', [['united states', 58]])}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('option', { name: /atlantis/ })).toBeInTheDocument();
  });

  it('says how many values the facet did not return', () => {
    renderApp(
      <TermsControl
        field={fieldNamed('country')}
        value={undefined}
        facet={facet('country', [['united states', 58]], 12)}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('12 more values not shown.')).toBeInTheDocument();
  });

  it('offers the typed value itself when the facet holds nothing like it', async () => {
    const { onChange } = show();

    await userEvent.type(screen.getByRole('combobox'), 'atlantis');
    await userEvent.click(screen.getByRole('option', { name: /atlantis/ }));

    expect(onChange).toHaveBeenCalledWith({ type: 'terms', values: ['atlantis'] });
  });
});
