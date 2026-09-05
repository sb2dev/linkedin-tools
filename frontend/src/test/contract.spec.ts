/**
 * The frontend mirrors the API contract by hand in `types/api.ts`, and encodes filters itself in
 * `lib/query-state.ts`. Both can drift from the backend without anything failing to compile, and a
 * drifted filter encoding fails silently: the page still renders, the filter just stops working.
 *
 * The backend's domain layer imports no framework, so these tests import the real registry and the
 * real query parser and check the two sides against each other rather than against a copy.
 */

import { describe, expect, it } from 'vitest';
import { SEARCH_FIELDS, SORT_OPTIONS } from '../../../backend/src/profiles/domain/search/field-registry';
import { parseFilterQuery } from '../../../backend/src/profiles/interface/http/filter-query.parser';
import { toQueryString } from '@/lib/query-state';
import type { FilterKind, FilterState, FilterValue, SearchField, SearchQuery, SortKey } from '@/types/api';

const FRONTEND_KINDS: FilterKind[] = ['terms', 'range', 'ordered_terms', 'date_range', 'exists'];
const FRONTEND_SORTS: SortKey[] = ['relevance', 'name', 'connections', 'experience', 'quality'];

function query(filters: FilterState): SearchQuery {
  return { q: '', sort: 'relevance', page: 1, size: 20, facets: [], filters };
}

/** What the frontend would send for these filters, parsed back by the backend's own parser. */
function roundTrip(filters: FilterState): Record<string, FilterValue> {
  return parseFilterQuery(toQueryString(query(filters)));
}

describe('the API contract the frontend mirrors', () => {
  it('declares every filter kind the registry uses', () => {
    const used = [...new Set(SEARCH_FIELDS.map((field) => field.kind))].sort();
    expect(used).toEqual([...FRONTEND_KINDS].sort());
  });

  it('declares every sort key the backend offers', () => {
    expect(SORT_OPTIONS.map((option) => option.key).sort()).toEqual([...FRONTEND_SORTS].sort());
  });

  it('accepts every field the schema endpoint would serve', () => {
    for (const field of SEARCH_FIELDS) {
      // `esField` is an index detail the API does not publish; everything else must line up.
      const { esField: _esField, ...served } = field;
      const mirrored: SearchField = {
        ...served,
        options: served.options === undefined ? undefined : [...served.options],
      };
      expect(mirrored.key).toBe(field.key);
      expect(FRONTEND_KINDS).toContain(mirrored.kind);
      expect(typeof mirrored.label).toBe('string');
      expect(typeof mirrored.group).toBe('string');
      expect(typeof mirrored.facetable).toBe('boolean');
    }
  });
});

describe('the filter encoding both sides have to agree on', () => {
  it('round-trips a terms filter', () => {
    expect(roundTrip({ skills: { type: 'terms', values: ['leadership', 'training'] } })).toEqual({
      skills: { type: 'terms', values: ['leadership', 'training'] },
    });
  });

  it('round-trips a value that contains the separator', () => {
    // The salary bands are the reason values are encoded one at a time: `<20,000` carries a comma.
    expect(roundTrip({ salaryBand: { type: 'terms', values: ['<20,000', '>250,000'] } })).toEqual({
      salaryBand: { type: 'terms', values: ['<20,000', '>250,000'] },
    });
  });

  it('round-trips a range, an open-ended range and a date range', () => {
    expect(roundTrip({ yearsExperience: { type: 'range', min: 5, max: 15 } })).toEqual({
      yearsExperience: { type: 'range', min: 5, max: 15 },
    });
    expect(roundTrip({ connections: { type: 'range', min: 500 } })).toEqual({
      connections: { type: 'range', min: 500 },
    });
    expect(roundTrip({ graduationYear: { type: 'date_range', from: '2000', to: '2010' } })).toEqual({
      graduationYear: { type: 'date_range', from: '2000', to: '2010' },
    });
  });

  it('round-trips both sides of an exists filter', () => {
    expect(roundTrip({ hasGithub: { type: 'exists', present: true } })).toEqual({
      hasGithub: { type: 'exists', present: true },
    });
    expect(roundTrip({ hasGithub: { type: 'exists', present: false } })).toEqual({
      hasGithub: { type: 'exists', present: false },
    });
  });

  it('round-trips values carrying spaces and non-Latin characters', () => {
    const values = ['head of growth', 'sāo paulo', 'r&d / 研究'];
    expect(roundTrip({ jobTitle: { type: 'terms', values } })).toEqual({
      jobTitle: { type: 'terms', values },
    });
  });

  it('round-trips every filterable field at once', () => {
    const filters: FilterState = {};
    for (const field of SEARCH_FIELDS) {
      switch (field.kind) {
        case 'terms':
          filters[field.key] = { type: 'terms', values: ['a value, with a comma', 'b'] };
          break;
        case 'ordered_terms':
          filters[field.key] = { type: 'terms', values: [field.options?.[0] ?? 'a'] };
          break;
        case 'range':
          filters[field.key] = { type: 'range', min: 1, max: 2 };
          break;
        case 'date_range':
          filters[field.key] = { type: 'date_range', from: '2000', to: '2010' };
          break;
        case 'exists':
          filters[field.key] = { type: 'exists', present: true };
          break;
      }
    }

    expect(Object.keys(roundTrip(filters)).sort()).toEqual(Object.keys(filters).sort());
  });
});
