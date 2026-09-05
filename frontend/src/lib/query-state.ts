/** The URL is the search state, read and written only here. */

import type { FilterKind, FilterState, FilterValue, SearchQuery, SearchSchema, SortKey } from '@/types/api';

export const FILTER_PREFIX = 'f.';
export const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
export const DEFAULT_SORT: SortKey = 'relevance';

const SORT_KEYS: readonly SortKey[] = ['relevance', 'name', 'connections', 'experience', 'quality'];
const RANGE_SEPARATOR = '..';

/** Resolves a filter key to the kind declared by the search schema. */
export type FilterKindLookup = (key: string) => FilterKind | undefined;

export function schemaKindLookup(schema: SearchSchema | undefined): FilterKindLookup {
  if (!schema) return () => undefined;
  const kinds = new Map(schema.fields.map((field) => [field.key, field.kind]));
  return (key) => kinds.get(key);
}

function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

function splitRange(raw: string): [string, string] {
  const at = raw.indexOf(RANGE_SEPARATOR);
  if (at < 0) return [raw.trim(), raw.trim()];
  return [raw.slice(0, at).trim(), raw.slice(at + RANGE_SEPARATOR.length).trim()];
}

function isNumericEnd(value: string): boolean {
  return value.length === 0 || Number.isFinite(Number(value));
}

/** Used before the schema loads. A date_range read as `range` re-encodes to the same string. */
function inferKind(raw: string): FilterKind {
  if (raw === 'true' || raw === 'false') return 'exists';
  if (raw.includes(RANGE_SEPARATOR)) {
    const [from, to] = splitRange(raw);
    return isNumericEnd(from) && isNumericEnd(to) ? 'range' : 'date_range';
  }
  return 'terms';
}

/** Inverse of `encodeFilterValue`: a terms list is split on the separating comma, then unescaped. */
function decodeFilterValue(raw: string, kind: FilterKind): FilterValue | null {
  switch (kind) {
    case 'exists': {
      if (raw === 'true') return { type: 'exists', present: true };
      if (raw === 'false') return { type: 'exists', present: false };
      return null;
    }
    case 'range': {
      const [from, to] = splitRange(raw);
      const min = from.length > 0 ? Number(from) : undefined;
      const max = to.length > 0 ? Number(to) : undefined;
      const value: FilterValue = { type: 'range' };
      if (min !== undefined && Number.isFinite(min)) value.min = min;
      if (max !== undefined && Number.isFinite(max)) value.max = max;
      return value.min === undefined && value.max === undefined ? null : value;
    }
    case 'date_range': {
      const [from, to] = splitRange(raw);
      const value: FilterValue = { type: 'date_range' };
      if (from.length > 0) value.from = from;
      if (to.length > 0) value.to = to;
      return value.from === undefined && value.to === undefined ? null : value;
    }
    default: {
      const values = raw
        .split(',')
        .map(decodeTerm)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      return values.length > 0 ? { type: 'terms', values } : null;
    }
  }
}

/** A hand-edited URL can carry a malformed escape; the raw text is a better answer than a crash. */
function decodeTerm(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

function encodeFilterValue(value: FilterValue): string | null {
  switch (value.type) {
    case 'terms': {
      const values = value.values.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
      return values.length > 0 ? values.map(encodeURIComponent).join(',') : null;
    }
    case 'range': {
      if (value.min === undefined && value.max === undefined) return null;
      return `${value.min ?? ''}${RANGE_SEPARATOR}${value.max ?? ''}`;
    }
    case 'date_range': {
      if (value.from === undefined && value.to === undefined) return null;
      return `${value.from ?? ''}${RANGE_SEPARATOR}${value.to ?? ''}`;
    }
    case 'exists':
      return value.present ? 'true' : 'false';
  }
}

function isEmptyFilterValue(value: FilterValue | undefined): boolean {
  return value === undefined || encodeFilterValue(value) === null;
}

function clampInteger(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (raw === null || !Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function parseSearchQuery(params: URLSearchParams, kindOf: FilterKindLookup = () => undefined): SearchQuery {
  const filters: FilterState = {};
  for (const key of new Set(params.keys())) {
    if (!key.startsWith(FILTER_PREFIX)) continue;
    const field = key.slice(FILTER_PREFIX.length);
    if (field.length === 0) continue;
    const parts = params.getAll(key).filter((part) => part.length > 0);
    if (parts.length === 0) continue;
    const kind = kindOf(field) ?? inferKind(parts[0]);
    // Repeated params are a convenience for hand-written URLs; terms merge, single values win last.
    const raw = kind === 'terms' || kind === 'ordered_terms' ? parts.join(',') : parts[parts.length - 1];
    const value = decodeFilterValue(raw, kind);
    if (value) filters[field] = value;
  }

  const sortParam = params.get('sort');
  return {
    q: (params.get('q') ?? '').trim(),
    sort: sortParam !== null && isSortKey(sortParam) ? sortParam : DEFAULT_SORT,
    page: clampInteger(params.get('page'), 1, 1, Number.MAX_SAFE_INTEGER),
    size: clampInteger(params.get('size'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
    facets: (params.get('facets') ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
    filters,
  };
}

/** The one parameter list behind both the browser URL and the API request. Defaults are omitted. */
function toParameters(query: SearchQuery): readonly (readonly [string, string])[] {
  const parameters: (readonly [string, string])[] = [];
  if (query.q.length > 0) parameters.push(['q', query.q]);
  if (query.sort !== DEFAULT_SORT) parameters.push(['sort', query.sort]);
  if (query.page > 1) parameters.push(['page', String(query.page)]);
  if (query.size !== DEFAULT_PAGE_SIZE) parameters.push(['size', String(query.size)]);
  if (query.facets.length > 0) parameters.push(['facets', query.facets.join(',')]);
  for (const key of Object.keys(query.filters).sort()) {
    const encoded = encodeFilterValue(query.filters[key]);
    if (encoded !== null) parameters.push([`${FILTER_PREFIX}${key}`, encoded]);
  }
  return parameters;
}

/** URLSearchParams escapes the `%` of an encoded term and restores it, so the URL round-trips. */
export function toSearchParams(query: SearchQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const [name, value] of toParameters(query)) params.set(name, value);
  return params;
}

/** The API request line, assembled by hand so a terms separator is not escaped along with its values. */
export function toQueryString(query: SearchQuery): string {
  return toParameters(query)
    .map(([name, value]) =>
      name.startsWith(FILTER_PREFIX) ? `${name}=${value}` : `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    )
    .join('&');
}

/** Any change other than paging returns to page one. */
export function updateQuery(query: SearchQuery, patch: Partial<SearchQuery>): SearchQuery {
  const next = { ...query, ...patch };
  const pagedOnly = Object.keys(patch).every((key) => key === 'page');
  return pagedOnly ? next : { ...next, page: patch.page ?? 1 };
}

export function setFilter(filters: FilterState, key: string, value: FilterValue | undefined): FilterState {
  const next = { ...filters };
  if (value === undefined || isEmptyFilterValue(value)) delete next[key];
  else next[key] = value;
  return next;
}
