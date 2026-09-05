/** The panel that edits one filter on a draft: Escape abandons it, Enter and Apply commit it. */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import type { FilterValue, SearchField } from '@/types/api';
import { renderApp } from '@/test';
import { facet, fieldNamed } from '@/test/fixtures';
import { FilterPopover } from './FilterPopover';

function show(
  field: SearchField = fieldNamed('country'),
  value?: FilterValue,
  withBack = false,
  anchorRef?: React.RefObject<HTMLButtonElement | null>,
) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  const onBack = vi.fn();
  renderApp(
    <FilterPopover
      field={field}
      value={value}
      facet={facet('country', [['united states', 58], ['canada', 4]])}
      anchorRef={anchorRef}
      onApply={onApply}
      onClose={onClose}
      {...(withBack ? { onBack } : {})}
    />,
  );
  return { onApply, onClose, onBack };
}

describe('FilterPopover', () => {
  it('names the field it is editing', () => {
    show();

    expect(screen.getByRole('dialog')).toHaveAccessibleName(/Country/);
  });

  it('applies the draft the reader built', async () => {
    const { onApply, onClose } = show();

    await userEvent.click(screen.getByRole('option', { name: /canada/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApply).toHaveBeenCalledWith({ type: 'terms', values: ['canada'] });
    expect(onClose).toHaveBeenCalled();
  });

  it('clears the filter entirely', async () => {
    const { onApply } = show(fieldNamed('country'), { type: 'terms', values: ['canada'] });

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onApply).toHaveBeenCalledWith(undefined);
  });

  it('abandons the draft on Escape, applying nothing', async () => {
    const { onApply, onClose } = show();

    await userEvent.click(screen.getByRole('option', { name: /canada/ }));
    await userEvent.keyboard('{Escape}');

    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('commits the draft on Enter from a field that is not a button', async () => {
    // A range control has no list of its own, so Enter reaches the popover.
    const { onApply, onClose } = show(fieldNamed('connections'));

    await userEvent.click(screen.getAllByRole('spinbutton')[0]);
    await userEvent.keyboard('{Enter}');

    expect(onApply).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('renders a typeahead for a field with thousands of values', () => {
    show(fieldNamed('skills'));

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-label', 'Search Skills');
  });

  it('offers a way back when it was opened from the field list', async () => {
    const { onBack } = show(fieldNamed('country'), undefined, true);

    await userEvent.click(screen.getByRole('button', { name: /Back/i }));

    expect(onBack).toHaveBeenCalled();
  });

  it('offers none when it was opened straight from the bar', () => {
    show();

    expect(screen.queryByRole('button', { name: /Back/i })).not.toBeInTheDocument();
  });

  it('keeps Tab inside the panel, in both directions', async () => {
    show();
    const buttons = screen.getAllByRole('button');
    const last = buttons[buttons.length - 1];

    last.focus();
    await userEvent.tab();
    expect(document.activeElement).not.toBe(last);

    await userEvent.tab({ shift: true });
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('hands focus back to the control that opened it', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const anchorRef = createRef<HTMLButtonElement>();
    // The ref is populated by hand, as the filter bar does at runtime.
    anchorRef.current = trigger;

    show(fieldNamed('country'), undefined, false, anchorRef);
    await userEvent.keyboard('{Escape}');

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('lets Tab move normally while focus is not on an edge', async () => {
    show();
    const buttons = screen.getAllByRole('button');

    buttons[0].focus();
    await userEvent.tab();

    expect(document.activeElement).not.toBe(buttons[0]);
  });

  it('renders the control the field kind calls for', () => {
    show(fieldNamed('connections'));

    expect(screen.getAllByRole('spinbutton').length).toBeGreaterThan(0);
  });

  it('renders a tri-state toggle for an exists field', () => {
    show(fieldNamed('hasTwitter'));

    expect(screen.getByRole('radio', { name: 'Any' })).toBeInTheDocument();
  });

  it('renders ordered chips for a closed vocabulary', () => {
    show(fieldNamed('seniority'));

    expect(screen.getByRole('button', { name: /manager/i })).toBeInTheDocument();
  });

  it('renders year boxes for a date range', () => {
    show(fieldNamed('graduationYear'));

    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0);
  });
});
