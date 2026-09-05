import { describe, expect, it } from 'vitest';
import {
  FILTER_PREFIX as BACKEND_FILTER_PREFIX,
  FilterQueryError,
  parseFilterQuery,
} from '../../../backend/src/profiles/interface/http/filter-query.parser';
import {
  SEARCH_FIELDS,
  type SearchField as BackendSearchField,
} from '../../../backend/src/profiles/domain/search/field-registry';
import type { FilterValue as BackendFilterValue } from '../../../backend/src/profiles/domain/search/search-criteria';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  FILTER_PREFIX,
  parseSearchQuery,
  schemaKindLookup,
  setFilter,
  toQueryString,
  toSearchParams,
  updateQuery,
} from '@/lib/query-state';
import type { FilterState, FilterValue, SearchQuery, SearchSchema, SortKey } from '@/types/api';

// The schema the app renders from is this registry, served as JSON, so tests read it from the source.
const schema: SearchSchema = {
  fields: SEARCH_FIELDS.map((field: BackendSearchField) => ({
    key: field.key,
    label: field.label,
    group: field.group,
    kind: field.kind,
    facetable: field.facetable,
    typeahead: field.typeahead,
    options: field.options ? [...field.options] : undefined,
    primary: field.primary,
    hint: field.hint,
  })),
  sorts: [],
  groups: [],
};

const kindOf = schemaKindLookup(schema);

const EMPTY: SearchQuery = {
  q: '',
  sort: DEFAULT_SORT,
  page: 1,
  size: DEFAULT_PAGE_SIZE,
  facets: [],
  filters: {},
};

function query(patch: Partial<SearchQuery> = {}): SearchQuery {
  return { ...EMPTY, ...patch };
}

/** What the browser address bar would hold, read back the way the app reads it. */
function throughUrl(input: SearchQuery): SearchQuery {
  return parseSearchQuery(new URLSearchParams(toSearchParams(input).toString()), kindOf);
}

/** What the API would receive, read by the backend's own parser. */
function throughApi(input: SearchQuery): Record<string, BackendFilterValue> {
  return parseFilterQuery(toQueryString(input));
}

function parse(search: string): SearchQuery {
  return parseSearchQuery(new URLSearchParams(search), kindOf);
}

describe('every filter kind survives the URL', () => {
  const cases: readonly (readonly [string, string, FilterValue])[] = [
    ['terms', 'skills', { type: 'terms', values: ['leadership', 'training'] }],
    ['ordered_terms', 'seniority', { type: 'terms', values: ['director', 'vp'] }],
    ['range with both bounds', 'yearsExperience', { type: 'range', min: 5, max: 15 }],
    ['range open at the top', 'yearsExperience', { type: 'range', min: 5 }],
    ['range open at the bottom', 'yearsExperience', { type: 'range', max: 15 }],
    ['range around zero', 'connections', { type: 'range', min: 0, max: 0 }],
    ['date_range with both bounds', 'graduationYear', { type: 'date_range', from: '2000', to: '2010' }],
    ['date_range open at the top', 'graduationYear', { type: 'date_range', from: '2000' }],
    ['date_range open at the bottom', 'graduationYear', { type: 'date_range', to: '2010' }],
    ['date_range at day precision', 'jobStartYear', { type: 'date_range', from: '2019-06-01', to: '2021-03-14' }],
    ['exists true', 'hasGithub', { type: 'exists', present: true }],
    ['exists false', 'hasGithub', { type: 'exists', present: false }],
  ];

  it.each(cases)('%s round trips unchanged', (_label, key, value) => {
    const state = query({ filters: { [key]: value } });
    expect(throughUrl(state)).toEqual(state);
  });

  it.each(cases)('%s reaches the backend as the same filter', (_label, key, value) => {
    expect(throughApi(query({ filters: { [key]: value } }))).toEqual({ [key]: value });
  });
});

describe('a term keeps every character the dataset puts in it', () => {
  const awkward: readonly (readonly [string, string])[] = [
    ['a comma, as the salary bands carry', '<20,000'],
    ['a space', 'head of growth'],
    ['a plus', 'c++ developer'],
    ['an ampersand', 'mergers & acquisitions'],
    ['a percent sign', '100% remote'],
    ['a non-Latin script', 'programación orientada a objetos'],
    ['CJK characters', '漢字'],
    ['an equals sign and a hash', 'a=b#c'],
    ['a literal percent escape', 'a%2Cb'],
    ['the range separator', 'node..js'],
    ['a quote', "o'brien & co"],
  ];

  it.each(awkward)('%s survives the browser URL', (_label, term) => {
    const state = query({ filters: { skills: { type: 'terms', values: [term] } } });
    expect(throughUrl(state)).toEqual(state);
  });

  it.each(awkward)('%s survives the request line', (_label, term) => {
    expect(throughApi(query({ filters: { skills: { type: 'terms', values: [term] } } }))).toEqual({
      skills: { type: 'terms', values: [term] },
    });
  });

  it('keeps a comma inside a value apart from the comma between values', () => {
    const state = query({ filters: { salaryBand: { type: 'terms', values: ['<20,000', '>250,000'] } } });

    expect(toQueryString(state)).toBe('f.salaryBand=%3C20%2C000,%3E250%2C000');
    expect(throughApi(state)).toEqual({ salaryBand: { type: 'terms', values: ['<20,000', '>250,000'] } });
  });

  it('keeps the free-text keywords out of the filter grammar', () => {
    const state = query({ q: 'growth & marketing, 50% remote' });
    expect(throughUrl(state)).toEqual(state);
  });
});

describe('the URL carries only what differs from the defaults', () => {
  it('writes nothing for an untouched search', () => {
    expect(toSearchParams(EMPTY).toString()).toBe('');
    expect(toQueryString(EMPTY)).toBe('');
  });

  it('reads an empty query string back as the defaults', () => {
    expect(parse('')).toEqual(EMPTY);
  });

  it('omits the default sort and the first page', () => {
    expect(toSearchParams(query({ sort: DEFAULT_SORT, page: 1, size: DEFAULT_PAGE_SIZE })).toString()).toBe('');
    expect(toSearchParams(query({ sort: 'name', page: 3 })).toString()).toBe('sort=name&page=3');
  });

  it('drops a filter whose value carries nothing', () => {
    const state = query({ filters: { skills: { type: 'terms', values: ['  ', ''] }, connections: { type: 'range' } } });
    expect(toSearchParams(state).toString()).toBe('');
  });

  it('orders filters by key so the same search always writes the same URL', () => {
    const one = query({ filters: { skills: { type: 'terms', values: ['a'] }, country: { type: 'terms', values: ['b'] } } });
    const other = query({ filters: { country: { type: 'terms', values: ['b'] }, skills: { type: 'terms', values: ['a'] } } });

    expect(toSearchParams(one).toString()).toBe(toSearchParams(other).toString());
    expect(toSearchParams(one).toString()).toBe('f.country=b&f.skills=a');
  });
});

describe('paging values are clamped to what the API accepts', () => {
  it.each([
    ['page=0', 'page', 1],
    ['page=-4', 'page', 1],
    ['page=abc', 'page', 1],
    ['page=', 'page', 1],
    ['page=2.7', 'page', 2],
    ['page=12', 'page', 12],
  ])('%s decodes to page %s', (search, _field, expected) => {
    expect(parse(search).page).toBe(expected);
  });

  it.each([
    ['size=0', 1],
    ['size=1000', 100],
    ['size=abc', DEFAULT_PAGE_SIZE],
    ['size=50', 50],
  ])('%s decodes to size %i', (search, expected) => {
    expect(parse(search).size).toBe(expected);
  });

  it('falls back to relevance when the sort is not one the API offers', () => {
    expect(parse('sort=salary').sort).toBe(DEFAULT_SORT);
    expect(parse('sort=quality').sort).toBe('quality');
  });
});

describe('a hand-edited URL degrades instead of throwing', () => {
  it('keeps a term with a malformed percent escape as the literal text', () => {
    expect(parse('f.skills=java%').filters.skills).toEqual({ type: 'terms', values: ['java%'] });
  });

  it('does not throw on a truncated multi-byte escape', () => {
    const values = parse('f.skills=%E0%A4%A').filters.skills;

    expect(values?.type).toBe('terms');
    expect(values).toEqual({ type: 'terms', values: [expect.stringContaining('%A')] });
  });

  it('ignores a filter parameter with no value', () => {
    expect(parse('f.skills=&q=java').filters).toEqual({});
  });

  it('ignores a filter parameter with no field name', () => {
    expect(parse('f.=java').filters).toEqual({});
  });

  it('merges a repeated terms parameter and drops the blank one', () => {
    expect(parse('f.skills=java&f.skills=&f.skills=go').filters.skills).toEqual({
      type: 'terms',
      values: ['java', 'go'],
    });
  });

  it('takes the last value of a repeated single-valued parameter, as the backend does', () => {
    expect(parse('f.yearsExperience=1..2&f.yearsExperience=5..15').filters.yearsExperience).toEqual({
      type: 'range',
      min: 5,
      max: 15,
    });
  });

  it('drops a range bound that is not a number and re-emits an open range the API accepts', () => {
    const decoded = parse('f.yearsExperience=abc..15');

    expect(decoded.filters.yearsExperience).toEqual({ type: 'range', max: 15 });
    expect(throughApi(decoded)).toEqual({ yearsExperience: { type: 'range', max: 15 } });
  });

  it('drops an exists filter that is neither true nor false', () => {
    expect(parse('f.hasGithub=yes').filters).toEqual({});
  });

  it('keeps a reversed range as typed so the control can report it', () => {
    // The range control shows "the lower bound is above the upper bound" from this value;
    expect(parse('f.yearsExperience=15..5').filters.yearsExperience).toEqual({ type: 'range', min: 15, max: 5 });
  });

  it('keeps the rest of the search when a filter key is not in the schema', () => {
    const decoded = parse('q=java&f.bogus=x&f.skills=go&page=2');

    expect(decoded.q).toBe('java');
    expect(decoded.page).toBe(2);
    expect(decoded.filters.skills).toEqual({ type: 'terms', values: ['go'] });
  });

  it('ignores parameters that are not filters and not search options', () => {
    expect(parse('utm_source=mail&q=java')).toEqual(query({ q: 'java' }));
  });

  it('reads a range written without a separator as that exact value', () => {
    expect(parse('f.yearsExperience=12').filters.yearsExperience).toEqual({ type: 'range', min: 12, max: 12 });
  });

  it('drops a range with no readable bound at either end', () => {
    expect(parse('f.yearsExperience=abc..def').filters).toEqual({});
  });

  it('drops a date range with nothing at either end', () => {
    expect(parse('f.graduationYear=..').filters).toEqual({});
  });

  it('drops a terms filter whose only value is whitespace', () => {
    expect(parse('f.skills=%20').filters).toEqual({});
  });

  it('reads a bare true or false as a presence filter before the schema has loaded', () => {
    const yes = parseSearchQuery(new URLSearchParams('f.hasGithub=true'));
    const no = parseSearchQuery(new URLSearchParams('f.hasGithub=false'));

    expect(yes.filters.hasGithub).toEqual({ type: 'exists', present: true });
    expect(no.filters.hasGithub).toEqual({ type: 'exists', present: false });
  });
});

describe('the schema decides how a value is read', () => {
  it('reads a two-number range as dates once the schema says the field holds dates', () => {
    const before = parseSearchQuery(new URLSearchParams('f.graduationYear=2000..2010'));
    const after = parse('f.graduationYear=2000..2010');

    expect(before.filters.graduationYear).toEqual({ type: 'range', min: 2000, max: 2010 });
    expect(after.filters.graduationYear).toEqual({ type: 'date_range', from: '2000', to: '2010' });
  });

  it('sends the same request line either way, so a search made before the schema loads is not wrong', () => {
    const before = parseSearchQuery(new URLSearchParams('f.graduationYear=2000..2010&f.skills=node..js'));

    expect(toQueryString(before)).toBe(toQueryString(parse('f.graduationYear=2000..2010&f.skills=node..js')));
    expect(throughApi(before)).toEqual({
      graduationYear: { type: 'date_range', from: '2000', to: '2010' },
      skills: { type: 'terms', values: ['node..js'] },
    });
  });
});

describe('the frontend and the backend agree on the encoding', () => {
  it('names filter parameters with the same prefix', () => {
    expect(FILTER_PREFIX).toBe(BACKEND_FILTER_PREFIX);
    expect(FILTER_PREFIX).toBe('f.');
  });

  it('separates range ends with .. and terms with a comma', () => {
    const state = query({
      filters: {
        yearsExperience: { type: 'range', min: 5, max: 15 },
        skills: { type: 'terms', values: ['a', 'b'] },
      },
    });

    expect(toQueryString(state)).toBe('f.skills=a,b&f.yearsExperience=5..15');
  });

  it('matches a closed vocabulary whatever case the URL spells it in', () => {
    const state = parse('f.seniority=Director,VP');

    expect(state.filters.seniority).toEqual({ type: 'terms', values: ['Director', 'VP'] });
    expect(throughApi(state)).toEqual({ seniority: { type: 'terms', values: ['director', 'vp'] } });
  });

  it('reports a value outside a closed vocabulary against its own parameter', () => {
    const state = parse('f.seniority=wizard');

    expect(() => throughApi(state)).toThrow(FilterQueryError);
    try {
      throughApi(state);
    } catch (error) {
      expect((error as FilterQueryError).parameter).toBe('f.seniority');
    }
  });

  it('reports a malformed date bound against the field the reader is editing', () => {
    // The date control warns about this before it is sent;
    const state = parse('f.graduationYear=20..2010');

    try {
      throughApi(state);
      expect.unreachable('the backend accepted a malformed date bound');
    } catch (error) {
      expect((error as FilterQueryError).parameter).toBe('f.graduationYear');
    }
  });

  it('accepts every field in the registry with a value of its declared kind', () => {
    const filters: FilterState = {};
    for (const field of SEARCH_FIELDS) {
      filters[field.key] = representativeValue(field);
    }

    expect(throughApi(query({ filters }))).toEqual(filters);
  });
});

/** A value the field would really hold, so the seam is checked for all 33 fields, not a sample. */
function representativeValue(field: BackendSearchField): FilterValue {
  switch (field.kind) {
    case 'exists':
      return { type: 'exists', present: true };
    case 'range':
      return { type: 'range', min: 1, max: 9 };
    case 'date_range':
      return { type: 'date_range', from: '2004-09', to: '2008' };
    default:
      return field.options
        ? { type: 'terms', values: [field.options[0], field.options[field.options.length - 1]] }
        : { type: 'terms', values: ['head of growth', '<20,000'] };
  }
}

describe('random search states survive both encodings', () => {
  const TERM_CHARACTERS = "abcXYZ019 ,+&%#?/=<>'\"éñ漢.-_~!*()[]{}|\\^`$@;:".split('');
  const SORTS: readonly SortKey[] = ['relevance', 'name', 'connections', 'experience', 'quality'];

  let seed = 1_234_567;
  const next = (): number => {
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fff_ffff;
    return seed / 0x7fff_ffff;
  };
  const pick = <T,>(values: readonly T[]): T => values[Math.floor(next() * values.length)];

  function randomTerm(): string {
    let term = '';
    const length = 1 + Math.floor(next() * 10);
    for (let i = 0; i < length; i += 1) term += pick(TERM_CHARACTERS);
    return term.trim();
  }

  function randomValue(field: BackendSearchField): FilterValue | undefined {
    if (field.kind === 'exists') return { type: 'exists', present: next() < 0.5 };
    if (field.kind === 'range') {
      const min = Math.floor(next() * 100);
      const max = min + Math.floor(next() * 100);
      const shape = Math.floor(next() * 3);
      if (shape === 0) return { type: 'range', min, max };
      return shape === 1 ? { type: 'range', min } : { type: 'range', max };
    }
    if (field.kind === 'date_range') {
      const from = String(1970 + Math.floor(next() * 40));
      const to = String(2015 + Math.floor(next() * 10));
      const shape = Math.floor(next() * 3);
      if (shape === 0) return { type: 'date_range', from, to };
      return shape === 1 ? { type: 'date_range', from } : { type: 'date_range', to };
    }
    const values: string[] = [];
    const count = 1 + Math.floor(next() * 3);
    for (let i = 0; i < count; i += 1) {
      const value = field.options ? pick(field.options) : randomTerm();
      if (value.length > 0 && !values.includes(value)) values.push(value);
    }
    return values.length > 0 ? { type: 'terms', values } : undefined;
  }

  function randomState(): SearchQuery {
    const filters: FilterState = {};
    for (const field of SEARCH_FIELDS) {
      if (next() < 0.15) {
        const value = randomValue(field);
        if (value) filters[field.key] = value;
      }
    }
    return {
      q: next() < 0.5 ? randomTerm() : '',
      sort: pick(SORTS),
      page: 1 + Math.floor(next() * 20),
      size: 1 + Math.floor(next() * 100),
      facets: [],
      filters,
    };
  }

  const states = Array.from({ length: 400 }, randomState);

  it('decodes back to the state that was encoded', () => {
    for (const [index, state] of states.entries()) {
      expect([index, throughUrl(state)]).toEqual([index, state]);
    }
  });

  it('reaches the backend as the filters the browser URL shows', () => {
    for (const [index, state] of states.entries()) {
      expect([index, throughApi(state)]).toEqual([index, state.filters]);
    }
  });
});

describe('changing the search', () => {
  const base = query({ q: 'java', page: 7, filters: { skills: { type: 'terms', values: ['go'] } } });

  it('returns to the first page whenever the result set changes', () => {
    expect(updateQuery(base, { q: 'rust' }).page).toBe(1);
    expect(updateQuery(base, { sort: 'name' }).page).toBe(1);
    expect(updateQuery(base, { filters: {} }).page).toBe(1);
  });

  it('keeps the page when only the page changes', () => {
    expect(updateQuery(base, { page: 3 })).toEqual({ ...base, page: 3 });
  });

  it('leaves the original untouched', () => {
    updateQuery(base, { q: 'rust' });
    expect(base.q).toBe('java');
  });

  it('adds, replaces and removes a filter without mutating the previous state', () => {
    const added = setFilter(base.filters, 'country', { type: 'terms', values: ['united states'] });
    expect(Object.keys(added).sort()).toEqual(['country', 'skills']);
    expect(Object.keys(base.filters)).toEqual(['skills']);

    const replaced = setFilter(added, 'skills', { type: 'terms', values: ['rust'] });
    expect(replaced.skills).toEqual({ type: 'terms', values: ['rust'] });

    expect(setFilter(added, 'skills', undefined).skills).toBeUndefined();
  });

  it('removes a filter that has been emptied rather than writing a blank parameter', () => {
    expect(setFilter(base.filters, 'skills', { type: 'terms', values: ['  '] })).toEqual({});
    expect(setFilter(base.filters, 'skills', { type: 'range' })).toEqual({});
    expect(setFilter(base.filters, 'graduationYear', { type: 'date_range' })).toEqual({
      skills: { type: 'terms', values: ['go'] },
    });
  });

  it('keeps an exists filter set to false, which is a real choice and not an empty one', () => {
    expect(setFilter({}, 'hasGithub', { type: 'exists', present: false })).toEqual({
      hasGithub: { type: 'exists', present: false },
    });
  });
});
