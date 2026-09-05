import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchKeys, useDebouncedTextField, useDebouncedValue, useProfile, useSearchResults } from '@/hooks/use-search';
import { DEFAULT_PAGE_SIZE, DEFAULT_SORT } from '@/lib/query-state';
import type { SearchQuery } from '@/types/api';
import { fakeFetch, jsonResponse, problemResponse } from '@/test';

const base: SearchQuery = {
  q: 'java',
  sort: DEFAULT_SORT,
  page: 1,
  size: DEFAULT_PAGE_SIZE,
  facets: [],
  filters: { skills: { type: 'terms', values: ['leadership'] } },
};

function withQuery(patch: Partial<SearchQuery>): SearchQuery {
  return { ...base, ...patch };
}

describe('query keys', () => {
  it('are identical for two searches that mean the same thing', () => {
    const one = withQuery({ filters: { skills: { type: 'terms', values: ['a'] }, country: { type: 'terms', values: ['b'] } } });
    const other = withQuery({ filters: { country: { type: 'terms', values: ['b'] }, skills: { type: 'terms', values: ['a'] } } });

    expect(searchKeys.results(one)).toEqual(searchKeys.results(other));
  });

  it('do not change when an equal query object is rebuilt', () => {
    expect(searchKeys.results({ ...base })).toEqual(searchKeys.results({ ...base }));
  });

  it.each<[string, SearchQuery]>([
    ['the keywords', withQuery({ q: 'rust' })],
    ['the sort', withQuery({ sort: 'name' })],
    ['the page', withQuery({ page: 2 })],
    ['the page size', withQuery({ size: 50 })],
    ['the requested facets', withQuery({ facets: ['skills'] })],
    ['a filter value', withQuery({ filters: { skills: { type: 'terms', values: ['training'] } } })],
    ['an added filter', withQuery({ filters: { ...base.filters, hasGithub: { type: 'exists', present: true } } })],
    ['a removed filter', withQuery({ filters: {} })],
  ])('change when %s changes', (_label, changed) => {
    expect(searchKeys.results(changed)).not.toEqual(searchKeys.results(base));
  });

  it('separate one profile from another and one prefix from another', () => {
    expect(searchKeys.profile('jane')).not.toEqual(searchKeys.profile('john'));
    expect(searchKeys.suggest('skills', 'lea')).not.toEqual(searchKeys.suggest('skills', 'lead'));
    expect(searchKeys.suggest('skills', 'lead')).not.toEqual(searchKeys.suggest('interests', 'lead'));
  });
});

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the first value straight away', () => {
    const { result } = renderHook(({ value }: { value: string }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'java' },
    });

    expect(result.current).toBe('java');
  });

  it('holds a change back until the delay has passed', () => {
    const { result, rerender } = renderHook(({ value }: { value: string }) => useDebouncedValue(value, 300), {
      initialProps: { value: '' },
    });

    rerender({ value: 'j' });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('j');
  });

  it('settles once on the last value of a burst of typing', () => {
    const seen: string[] = [];
    const { rerender } = renderHook(
      ({ value }: { value: string }) => {
        seen.push(useDebouncedValue(value, 300));
      },
      { initialProps: { value: '' } },
    );

    for (const value of ['j', 'ja', 'jav', 'java']) {
      rerender({ value });
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(new Set(seen)).toEqual(new Set(['', 'java']));
  });

  it('forgets a pending change once it is unmounted', () => {
    const { rerender, unmount } = renderHook(({ value }: { value: string }) => useDebouncedValue(value, 300), {
      initialProps: { value: '' },
    });

    rerender({ value: 'java' });
    unmount();

    expect(() => {
      vi.advanceTimersByTime(1000);
    }).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useDebouncedTextField', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mount(initial = '') {
    const commits: string[] = [];
    const view = renderHook(
      ({ value }: { value: string }) =>
        useDebouncedTextField(
          value,
          (next: string) => {
            commits.push(next);
          },
          300,
        ),
      { initialProps: { value: initial } },
    );
    return { ...view, commits };
  }

  function type(setDraft: (next: string) => void, text: string): void {
    act(() => {
      setDraft(text);
    });
  }

  function settle(): void {
    act(() => {
      vi.advanceTimersByTime(300);
    });
  }

  it('shows every keystroke immediately', () => {
    const { result } = mount();

    type(result.current[1], 'jav');

    expect(result.current[0]).toBe('jav');
  });

  it('commits once, with the last thing typed', () => {
    const { result, commits } = mount();

    for (const text of ['j', 'ja', 'jav', 'java']) {
      type(result.current[1], text);
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }
    settle();

    expect(commits).toEqual(['java']);
  });

  it('does not commit while the reader is still typing', () => {
    const { result, commits } = mount();

    type(result.current[1], 'java');
    act(() => {
      vi.advanceTimersByTime(299);
    });

    expect(commits).toEqual([]);
  });

  it('commits nothing when the field is only mounted', () => {
    const { commits } = mount('java');

    settle();

    expect(commits).toEqual([]);
  });

  it('refills the field when the search changes underneath it, as Back does', () => {
    const { result, rerender, commits } = mount();

    type(result.current[1], 'java');
    settle();
    rerender({ value: 'go' });

    expect(result.current[0]).toBe('go');
    settle();
    expect(commits).toEqual(['java']);
  });

  it('does not overwrite newer keystrokes with the echo of what it just committed', () => {
    const { result, rerender, commits } = mount();

    type(result.current[1], 'java');
    settle();
    expect(commits).toEqual(['java']);

    // The reader keeps typing while the committed search is still making its way back through the router;
    type(result.current[1], 'javascript');
    rerender({ value: 'java' });

    expect(result.current[0]).toBe('javascript');
  });

  it('keeps a trailing space, which the URL cannot carry back', () => {
    const { result, rerender } = mount();

    type(result.current[1], 'java ');
    settle();
    rerender({ value: 'java' });

    expect(result.current[0]).toBe('java ');
  });

  it('commits again after the search has moved underneath it', () => {
    const { result, rerender, commits } = mount();

    type(result.current[1], 'java');
    settle();
    rerender({ value: 'java' });
    type(result.current[1], 'rust');
    settle();

    expect(commits).toEqual(['java', 'rust']);
  });
});

describe('useSearchResults', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function wrapper(client: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client }, children);
    };
  }

  function newClient(): QueryClient {
    return new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  }

  it('asks the API for the search it was given', async () => {
    const fake = fakeFetch(() => jsonResponse({ items: [], total: 0, page: 1, size: 20, facets: [], tookMs: 1 }));
    vi.stubGlobal('fetch', fake.fetch);
    const client = newClient();

    const { result } = renderHook(() => useSearchResults(base), { wrapper: wrapper(client) });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fake.lastRequest.url).toBe('/api/search?q=java&f.skills=leadership');
    client.clear();
  });

  it('does not retry a search the API has refused', async () => {
    const fake = fakeFetch(() => problemResponse(400, { title: 'Bad Request', status: 400, detail: 'nope' }));
    vi.stubGlobal('fetch', fake.fetch);
    const client = newClient();

    const { result } = renderHook(() => useSearchResults(base), { wrapper: wrapper(client) });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(fake.callCount).toBe(1);
    client.clear();
  });
});

describe('useProfile', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for nothing when the address carries no username to ask about', async () => {
    const fake = fakeFetch(() => jsonResponse({}));
    vi.stubGlobal('fetch', fake.fetch);
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });

    const { result } = renderHook(() => useProfile(undefined), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fake.callCount).toBe(0);
    client.clear();
  });
});
