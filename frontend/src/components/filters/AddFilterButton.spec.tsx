/** The panel that exposes every filter the schema declares, grouped and searchable. */

import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FilterState } from '@/types/api';
import { renderApp } from '@/test';
import { facet, searchSchema } from '@/test/fixtures';
import { AddFilterButton } from './AddFilterButton';

function show(filters: FilterState = {}, open = true) {
  const onChange = vi.fn();
  const onOpenChange = vi.fn();
  const schema = searchSchema();
  renderApp(
    <AddFilterButton
      fields={schema.fields}
      groups={schema.groups}
      filters={filters}
      facets={new Map([['country', facet('country', [['united states', 58]])]])}
      open={open}
      onOpenChange={onOpenChange}
      onChange={onChange}
    />,
  );
  return { onChange, onOpenChange };
}

describe('AddFilterButton', () => {
  it('opens on the trigger', async () => {
    const { onOpenChange } = show({}, false);

    await userEvent.click(screen.getByRole('button', { name: /Add filter/ }));

    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('lists the fields under the groups the schema declares', () => {
    show();

    expect(screen.getByText('Expertise')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Skills/ })).toBeInTheDocument();
  });

  it('still shows a field whose group the schema never listed', () => {
    const schema = searchSchema();
    const onChange = vi.fn();
    renderApp(
      <AddFilterButton
        fields={[...schema.fields, { key: 'odd', label: 'Odd one', group: 'Nowhere', kind: 'terms', facetable: false }]}
        groups={schema.groups}
        filters={{}}
        facets={new Map()}
        open
        onOpenChange={vi.fn()}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('option', { name: /Odd one/ })).toBeInTheDocument();
  });

  it('narrows the list as the reader types', async () => {
    show();

    await userEvent.type(screen.getByRole('combobox'), 'countr');

    expect(screen.getByRole('option', { name: /Country/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Skills/ })).not.toBeInTheDocument();
  });

  it('says so when nothing matches what was typed', async () => {
    show();

    await userEvent.type(screen.getByRole('combobox'), 'zzzz');

    expect(screen.getByText('No field matches.')).toBeInTheDocument();
  });

  it('marks the filters already on', () => {
    show({ country: { type: 'terms', values: ['united states'] } });

    const option = screen.getByRole('option', { name: /Country/ });
    expect(within(option).getByLabelText('active')).toBeInTheDocument();
  });

  it('shows how many values a facet holds', () => {
    show();

    expect(within(screen.getByRole('option', { name: /Country/ })).getByText('1')).toBeInTheDocument();
  });

  it('sorts a group the schema listed before one it did not', () => {
    const schema = searchSchema();
    renderApp(
      <AddFilterButton
        fields={[
          { key: 'odd', label: 'Odd one', group: 'Nowhere', kind: 'terms', facetable: false },
          ...schema.fields,
        ]}
        groups={schema.groups}
        filters={{}}
        facets={new Map()}
        open
        onOpenChange={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    const headings = screen.getAllByText(/^(Expertise|Nowhere)$/).map((node) => node.textContent);
    expect(headings[0]).toBe('Expertise');
  });

  it('shows the hint a field carries', () => {
    show();

    expect(screen.getByText(/a band, not a figure/i)).toBeInTheDocument();
  });

  it('opens a field into its own control', async () => {
    show();

    await userEvent.click(screen.getByRole('option', { name: /Country/ }));

    // The chosen field's control replaces the list of fields with the field's own editor.
    expect(await screen.findByRole('button', { name: /Apply/i })).toBeInTheDocument();
    expect(screen.queryByText('Expertise')).not.toBeInTheDocument();
  });

  it('goes back to the field list from a field it opened', async () => {
    show();

    await userEvent.click(screen.getByRole('option', { name: /Country/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Back/i }));

    expect(screen.getByText('Expertise')).toBeInTheDocument();
  });

  describe('with the keyboard', () => {
    it('walks the list and opens the active field', async () => {
      show();

      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.keyboard('{ArrowDown}{Enter}');

      expect(await screen.findByRole('button', { name: /Apply/i })).toBeInTheDocument();
    });

    it('wraps upward from the first row', async () => {
      show();

      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.keyboard('{ArrowUp}{Enter}');

      expect(await screen.findByRole('button', { name: /Apply/i })).toBeInTheDocument();
    });

    it('closes on Escape', async () => {
      const { onOpenChange } = show();

      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.keyboard('{Escape}');

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('ignores the arrows and Enter when the list is empty', async () => {
      const { onOpenChange } = show();

      await userEvent.type(screen.getByRole('combobox'), 'zzzz');
      await userEvent.keyboard('{ArrowDown}{Enter}');

      // The list is still on screen; no field control replaced it.
      expect(screen.queryByRole('button', { name: /Apply/i })).not.toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });
});
