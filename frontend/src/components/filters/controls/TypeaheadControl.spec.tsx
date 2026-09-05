/**
 * The control for a field no dropdown can hold. Options arrive per prefix from the API, the reader
 * can pick one with the keyboard, and a value nobody has yet can still be added by hand.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FilterValue } from '@/types/api';
import { fakeFetch, jsonResponse, problemResponse, renderApp } from '@/test';
import { fieldNamed } from '@/test/fixtures';
import { TypeaheadControl } from './TypeaheadControl';

function install(reply: Parameters<typeof fakeFetch>[0]): ReturnType<typeof fakeFetch> {
  const fake = fakeFetch(reply);
  vi.stubGlobal('fetch', fake.fetch);
  return fake;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function serve(values: string[]): void {
  install(() => jsonResponse({ values }));
}

function show(value?: FilterValue) {
  const onChange = vi.fn();
  renderApp(<TypeaheadControl field={fieldNamed('skills')} value={value} onChange={onChange} />);
  return { onChange, box: screen.getByRole('combobox') };
}

/** The control debounces by 200ms before it asks the API. */
async function type(box: HTMLElement, text: string): Promise<void> {
  await userEvent.type(box, text);
  await waitFor(() => {
    expect(screen.queryByText('Start typing to see matching values.')).not.toBeInTheDocument();
  });
}

describe('TypeaheadControl', () => {
  it('asks the reader to type before it shows anything', () => {
    serve([]);
    show();

    expect(screen.getByText('Start typing to see matching values.')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });

  it('lists what the API returns for the prefix', async () => {
    serve(['leadership', 'leadership development']);
    const { box } = show();

    await type(box, 'lead');

    const list = await screen.findByRole('listbox', { name: 'Skills' });
    expect(within(list).getByText('leadership')).toBeInTheDocument();
    expect(within(list).getByText('leadership development')).toBeInTheDocument();
  });

  it('adds the value it is given, and clears the box', async () => {
    serve(['leadership']);
    const { onChange, box } = show();
    await type(box, 'lead');

    await userEvent.click(await screen.findByText('leadership'));

    expect(onChange).toHaveBeenCalledWith({ type: 'terms', values: ['leadership'] });
    expect(box).toHaveValue('');
  });

  it('leaves out a value the reader has already picked', async () => {
    serve(['leadership', 'training']);
    const { box } = show({ type: 'terms', values: ['leadership'] });

    await type(box, 'lea');

    const list = await screen.findByRole('listbox', { name: 'Skills' });
    expect(within(list).queryByText('leadership')).not.toBeInTheDocument();
    expect(within(list).getByText('training')).toBeInTheDocument();
  });

  it('offers the typed text itself when the API has no such value', async () => {
    serve([]);
    const { onChange, box } = show();

    await type(box, 'quantum welding');

    await userEvent.click(await screen.findByText('quantum welding'));
    expect(onChange).toHaveBeenCalledWith({ type: 'terms', values: ['quantum welding'] });
  });

  it('does not offer the typed text twice when the API already returned it', async () => {
    serve(['leadership']);
    const { box } = show();

    await type(box, 'leadership');

    const list = await screen.findByRole('listbox', { name: 'Skills' });
    expect(within(list).getAllByText('leadership')).toHaveLength(1);
  });

  it('shows what is already selected, and removes one on request', async () => {
    serve([]);
    const { onChange } = show({ type: 'terms', values: ['leadership', 'training'] });

    await userEvent.click(screen.getByRole('button', { name: /Remove leadership/i }));

    expect(onChange).toHaveBeenCalledWith({ type: 'terms', values: ['training'] });
  });

  describe('with the keyboard', () => {
    it('walks the options and commits the active one', async () => {
      serve(['leadership', 'training']);
      const { onChange, box } = show();
      await type(box, 'l');
      await screen.findByText('training');

      await userEvent.keyboard('{ArrowDown}{Enter}');

      expect(onChange).toHaveBeenCalledWith({ type: 'terms', values: ['training'] });
    });

    it('wraps from the first option round to the last', async () => {
      // Typing a value the API already returns means there is no extra "add what you typed" row.
      serve(['leadership', 'training']);
      const { onChange, box } = show();
      await type(box, 'leadership');
      await screen.findByText('training');

      await userEvent.keyboard('{ArrowUp}{Enter}');

      expect(onChange).toHaveBeenCalledWith({ type: 'terms', values: ['training'] });
    });

    it('commits the typed value when it is the active row', async () => {
      serve([]);
      const { onChange, box } = show();
      await type(box, 'quantum welding');
      await screen.findByText('quantum welding');

      await userEvent.keyboard('{Enter}');

      expect(onChange).toHaveBeenCalledWith({ type: 'terms', values: ['quantum welding'] });
    });

    it('ignores the arrows and Enter while there is nothing to pick', async () => {
      serve([]);
      const { onChange, box } = show();

      await userEvent.click(box);
      await userEvent.keyboard('{ArrowDown}{Enter}');

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('while the API is slow or down', () => {
    it('says it is searching', async () => {
      vi.stubGlobal('fetch', () => new Promise<Response>(() => undefined));
      const { box } = show();

      await userEvent.type(box, 'lead');

      expect(await screen.findByText('Searching…')).toBeInTheDocument();
    });

    it('says suggestions are unavailable rather than showing an empty list', async () => {
      install(() => problemResponse(500, { title: 'Internal server error', status: 500 }));
      const { box } = show();

      await userEvent.type(box, 'lead');

      // A 5xx is retried before it is called a failure, so this takes longer than a plain render.
      expect(
        await screen.findByText('Suggestions are unavailable right now.', undefined, { timeout: 5000 }),
      ).toBeInTheDocument();
    });
  });
});
