/** Each endpoint call is a promise to the backend about a path and its parameters. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProfile, getSchema, search, suggest } from '@/api/search';
import { setAccessToken } from '@/api/client';
import { DEFAULT_PAGE_SIZE, DEFAULT_SORT } from '@/lib/query-state';
import type { SearchQuery } from '@/types/api';
import { fakeFetch, jsonResponse, problemResponse } from '@/test';
import { ApiError } from '@/types/api';

function install(reply: Parameters<typeof fakeFetch>[0]): ReturnType<typeof fakeFetch> {
  const fake = fakeFetch(reply);
  vi.stubGlobal('fetch', fake.fetch);
  return fake;
}

const query: SearchQuery = {
  q: 'growth marketing',
  sort: DEFAULT_SORT,
  page: 1,
  size: DEFAULT_PAGE_SIZE,
  facets: [],
  filters: {},
};

beforeEach(() => {
  setAccessToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe('getSchema', () => {
  it('reads the filter vocabulary from the schema endpoint', async () => {
    const fake = install(() => jsonResponse({ fields: [], sorts: [], groups: [] }));

    await getSchema();

    expect(fake.lastRequest.url).toBe('/api/search/schema');
  });

  it('passes an abort signal through to fetch', async () => {
    const fake = install(() => jsonResponse({ fields: [], sorts: [], groups: [] }));

    await getSchema(new AbortController().signal);

    expect(fake.callCount).toBe(1);
  });
});

describe('search', () => {
  it('sends the whole search state on the request line', async () => {
    const fake = install(() => jsonResponse({ items: [], total: 0, page: 1, size: 20, facets: [], tookMs: 1 }));

    await search({
      ...query,
      sort: 'name',
      page: 2,
      size: 50,
      facets: ['skills', 'country'],
      filters: {
        skills: { type: 'terms', values: ['leadership', 'training'] },
        salaryBand: { type: 'terms', values: ['<20,000'] },
        yearsExperience: { type: 'range', min: 5 },
        hasGithub: { type: 'exists', present: false },
      },
    });

    expect(fake.lastRequest.path).toBe('/api/search');
    expect(fake.lastRequest.search).toBe(
      'q=growth%20marketing&sort=name&page=2&size=50&facets=skills%2Ccountry' +
        '&f.hasGithub=false&f.salaryBand=%3C20%2C000&f.skills=leadership,training&f.yearsExperience=5..',
    );
  });

  it('sends nothing but the path for an untouched search', async () => {
    const fake = install(() => jsonResponse({ items: [], total: 0, page: 1, size: 20, facets: [], tookMs: 1 }));

    await search({ ...query, q: '' });

    expect(fake.lastRequest.url).toBe('/api/search');
  });

  it('returns the result page as it arrives', async () => {
    const page = { items: [], total: 302, page: 1, size: 20, facets: [], tookMs: 7 };
    install(() => jsonResponse(page));

    await expect(search(query)).resolves.toEqual(page);
  });

  it('never sends the token, since search needs no session', async () => {
    setAccessToken('token-1');
    const fake = install(() => jsonResponse({ items: [], total: 0, page: 1, size: 20, facets: [], tookMs: 1 }));

    await search(query);

    expect(fake.lastRequest.headers.Authorization).toBeUndefined();
  });
});

describe('suggest', () => {
  it('asks for completions of a field with the typed prefix', async () => {
    const fake = install(() => jsonResponse({ values: ['leadership'] }));

    await suggest('skills', 'lead');

    expect(fake.lastRequest.path).toBe('/api/search/suggest');
    expect(new URLSearchParams(fake.lastRequest.search).get('field')).toBe('skills');
    expect(new URLSearchParams(fake.lastRequest.search).get('q')).toBe('lead');
    expect(new URLSearchParams(fake.lastRequest.search).get('limit')).toBe('10');
  });

  it('sends the limit the caller chose', async () => {
    const fake = install(() => jsonResponse({ values: [] }));

    await suggest('skills', 'lead', 12);

    expect(new URLSearchParams(fake.lastRequest.search).get('limit')).toBe('12');
  });

  it('escapes a prefix that would otherwise break the query string', async () => {
    const fake = install(() => jsonResponse({ values: [] }));

    await suggest('companyName', 'a&b c');

    expect(new URLSearchParams(fake.lastRequest.search).get('q')).toBe('a&b c');
  });

  it('unwraps the values so callers hold a plain list', async () => {
    install(() => jsonResponse({ values: ['leadership', 'team leadership'] }));

    await expect(suggest('skills', 'lead')).resolves.toEqual(['leadership', 'team leadership']);
  });
});

describe('getProfile', () => {
  it('reads one profile by username', async () => {
    const fake = install(() => jsonResponse({ contentHash: 'abc' }));

    await getProfile('jane-doe-1a2b3c');

    expect(fake.lastRequest.url).toBe('/api/profiles/jane-doe-1a2b3c');
  });

  it('escapes a username that carries URL punctuation', async () => {
    const fake = install(() => jsonResponse({ contentHash: 'abc' }));

    await getProfile('a/b?c d');

    expect(fake.lastRequest.url).toBe('/api/profiles/a%2Fb%3Fc%20d');
  });

  it('sends the token when one is held, because contact details depend on it', async () => {
    setAccessToken('token-1');
    const fake = install(() => jsonResponse({ contentHash: 'abc' }));

    await getProfile('jane');

    expect(fake.lastRequest.headers.Authorization).toBe('Bearer token-1');
  });

  it('asks anyway when signed out, and gets the public half', async () => {
    const fake = install(() => jsonResponse({ contentHash: 'abc' }));

    await getProfile('jane');

    expect(fake.callCount).toBe(1);
    expect(fake.lastRequest.headers.Authorization).toBeUndefined();
  });

  it('reports a missing profile as a not-found ApiError', async () => {
    install(() => problemResponse(404, { title: 'Not Found', status: 404, detail: 'No profile' }, 'Not Found'));

    const error = (await getProfile('nobody').catch((cause: unknown) => cause)) as ApiError;

    expect(error.isNotFound).toBe(true);
  });
});
