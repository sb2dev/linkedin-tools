/** What main.tsx does once it has found #root: mount the real app under a router and a client. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { createAppQueryClient, mountApp } from '@/bootstrap';
import { fakeFetch, jsonResponse } from '@/test';
import { searchResult, searchSchema } from '@/test/fixtures';

let container: HTMLElement | null = null;

afterEach(() => {
  vi.unstubAllGlobals();
  container?.remove();
  container = null;
});

describe('createAppQueryClient', () => {
  it('does not retry, because hooks/use-search decides that per query', () => {
    const options = createAppQueryClient().getDefaultOptions().queries;

    expect(options?.retry).toBe(false);
    expect(options?.refetchOnWindowFocus).toBe(false);
  });
});

describe('mountApp', () => {
  it('renders the real application into the container it is given', () => {
    const fake = fakeFetch((request) =>
      jsonResponse(request.url.includes('/schema') ? searchSchema() : searchResult()),
    );
    vi.stubGlobal('fetch', fake.fetch);
    container = document.createElement('div');
    document.body.append(container);

    let root!: ReturnType<typeof mountApp>;
    act(() => {
      root = mountApp(container);
    });

    expect(container.querySelector('form[role="search"]')).not.toBeNull();
    act(() => {
      root.unmount();
    });
  });

  it('fails loudly when the page has no #root, rather than doing nothing', () => {
    expect(() => mountApp(null)).toThrow('Missing #root element');
  });
});
