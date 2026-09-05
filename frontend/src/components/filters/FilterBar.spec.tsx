import { useState } from 'react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar } from './FilterBar';
import { facet, renderApp, searchSchema } from '@/test';
import type { Facet, FilterState, FilterValue, SearchField } from '@/types/api';

const schema = searchSchema();

const FACETS: Facet[] = [
  facet('industry', [['civil engineering', 41], ['military', 4]]),
  facet('country', [['united states', 231], ['india', 12]]),
];

/** Mirrors what SearchPage does with the callbacks, so the bar can be driven end to end. */
function Bar({
  fields = schema.fields,
  filters: initial = {},
  facets = FACETS,
  onFilters = vi.fn(),
}: {
  fields?: SearchField[];
  filters?: FilterState;
  facets?: Facet[];
  onFilters?: (filters: FilterState) => void;
}): ReactElement {
  const [filters, setFilters] = useState<FilterState>(initial);
  const change = (key: string, value: FilterValue | undefined): void => {
    setFilters((current) => {
      const next = { ...current };
      if (value === undefined) delete next[key];
      else next[key] = value;
      onFilters(next);
      return next;
    });
  };
  return (
    <FilterBar
      fields={fields}
      groups={schema.groups}
      filters={filters}
      facets={facets}
      onChange={change}
      onClearAll={() => {
        setFilters({});
        onFilters({});
      }}
    />
  );
}

async function openAddFilter(user: ReturnType<typeof userEvent.setup>, label: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Add filter' }));
  await user.click(screen.getByRole('option', { name: new RegExp(`^${label}`) }));
}

describe('FilterBar', () => {
  it('builds its whole control set from the schema, with no field list of its own', () => {
    renderApp(<Bar />);

    const expected = schema.fields.filter((field) => field.primary === true).map((field) => field.label);
    const triggers = screen.getAllByRole('button', { expanded: false }).map((button) => button.textContent?.replace('▾', '') ?? '');

    expect(expected.every((label) => triggers.includes(label))).toBe(true);
  });

  it('shows a field the backend adds later without any change here', async () => {
    const user = userEvent.setup();
    const added: SearchField = {
      key: 'twitterUsername',
      label: 'Twitter handle',
      group: 'Person',
      kind: 'terms',
      facetable: true,
      primary: true,
      hint: 'A handle, never a phone number or an email address',
    };
    renderApp(
      <Bar
        fields={[...schema.fields, added]}
        facets={[...FACETS, facet('twitterUsername', [['joeyholland', 1], ['tsmartin', 1]])]}
      />,
    );

    // The trigger appears in the bar, and the panel behind it is the control the kind calls for.
    await user.click(screen.getByRole('button', { name: 'Twitter handle' }));
    const panel = screen.getByRole('dialog', { name: 'Filter by Twitter handle' });
    expect(within(panel).getByRole('option', { name: /joeyholland/ })).toBeInTheDocument();
    expect(within(panel).getByText('A handle, never a phone number or an email address')).toBeInTheDocument();
  });

  it('gives each kind of field the control that kind calls for', async () => {
    const user = userEvent.setup();
    renderApp(<Bar />);

    await user.click(screen.getByRole('button', { name: 'Industry' }));
    expect(within(screen.getByRole('dialog')).getByRole('option', { name: /civil engineering\s*41/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Salary band' }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: '<20,000' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await openAddFilter(user, 'Years of experience');
    expect(screen.getByLabelText('Minimum Years of experience')).toBeInTheDocument();
    expect(screen.getByLabelText('Maximum Years of experience')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await openAddFilter(user, 'Has Twitter');
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    await user.keyboard('{Escape}');

    await openAddFilter(user, 'Graduated');
    expect(screen.getByLabelText('Earliest Graduated')).toBeInTheDocument();
  });

  it('applies the chosen values and closes the popover', async () => {
    const onFilters = vi.fn();
    const user = userEvent.setup();
    renderApp(<Bar onFilters={onFilters} />);

    await user.click(screen.getByRole('button', { name: 'Industry' }));
    await user.click(screen.getByRole('option', { name: /civil engineering/ }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onFilters).toHaveBeenLastCalledWith({ industry: { type: 'terms', values: ['civil engineering'] } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('applies on Enter from inside the panel', async () => {
    const onFilters = vi.fn();
    const user = userEvent.setup();
    renderApp(<Bar onFilters={onFilters} />);

    await openAddFilter(user, 'Years of experience');
    await user.type(screen.getByLabelText('Minimum Years of experience'), '12{Enter}');

    expect(onFilters).toHaveBeenLastCalledWith({ yearsExperience: { type: 'range', min: 12 } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('abandons the draft on Escape and puts focus back on the trigger', async () => {
    const onFilters = vi.fn();
    const user = userEvent.setup();
    renderApp(<Bar onFilters={onFilters} />);
    const trigger = screen.getByRole('button', { name: 'Industry' });

    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: /military/ }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onFilters).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('clears one filter from its own popover', async () => {
    const onFilters = vi.fn();
    const user = userEvent.setup();
    renderApp(<Bar filters={{ gender: { type: 'terms', values: ['female'] } }} onFilters={onFilters} />);

    await user.click(screen.getByRole('button', { name: 'Gender: Female' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onFilters).toHaveBeenLastCalledWith({});
  });

  it('keeps one popover open at a time', async () => {
    const user = userEvent.setup();
    renderApp(<Bar />);

    await user.click(screen.getByRole('button', { name: 'Industry' }));
    await user.click(screen.getByRole('button', { name: 'Country' }));

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Filter by Country' })).toBeInTheDocument();
  });

  it('asks the page for the counts of a field the search did not facet on', async () => {
    const onRequestFacet = vi.fn();
    const user = userEvent.setup();
    renderApp(
      <FilterBar
        fields={schema.fields}
        groups={schema.groups}
        filters={{}}
        facets={FACETS}
        onChange={vi.fn()}
        onClearAll={vi.fn()}
        onRequestFacet={onRequestFacet}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Job function' }));

    expect(onRequestFacet).toHaveBeenCalledWith('jobRole');
  });

  it('does not ask again for counts it already has, or for a typeahead field', async () => {
    const onRequestFacet = vi.fn();
    const user = userEvent.setup();
    renderApp(
      <FilterBar
        fields={schema.fields}
        groups={schema.groups}
        filters={{}}
        facets={FACETS}
        onChange={vi.fn()}
        onClearAll={vi.fn()}
        onRequestFacet={onRequestFacet}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Industry' }));
    await user.click(screen.getByRole('button', { name: 'Skills' }));

    expect(onRequestFacet).not.toHaveBeenCalled();
  });
});
