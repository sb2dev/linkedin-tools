/** SearchCriteria into the Elasticsearch Query DSL, and aggregation responses back into facets. */

import { estypes } from '@elastic/elasticsearch';

import {
  FACETABLE_FIELDS,
  KEYWORD_FIELDS,
  SEARCH_FIELD_BY_KEY,
  SearchField,
} from '../../domain/search/field-registry';
import { AppliedFilter, SearchCriteria } from '../../domain/search/search-criteria';
import { Facet, FacetBucket } from '../../domain/search/search-result';
import { SUMMARY_SOURCE_FIELDS } from '../../domain/search/profile-document';
import {
  PARTIAL_DATE_FORMATS,
  analyzedFieldFor,
  isBooleanField,
  mappingPropertyAt,
  prefixFieldFor,
} from './profile.mapping';

export type SearchBody = Omit<estypes.SearchRequest, 'index'>;

/** Buckets returned per facet unless the caller asks for more. */
const DEFAULT_FACET_SIZE = 15;

/** Terms sub-aggregation inside a nested facet. */
const NESTED_VALUES_AGG = 'values';

/** reverse_nested sub-aggregation that turns entry counts back into people. */
const PROFILE_COUNT_AGG = 'profiles';

/** Wrapper that re-scopes a facet away from its own filter. */
const FACET_SCOPE_AGG = 'scope';

export function buildSearchBody(criteria: SearchCriteria): SearchBody {
  const aggregations = buildAggregations(criteria);
  const highlight = buildHighlight(criteria);
  return {
    from: criteria.from,
    size: criteria.pagination.size,
    track_total_hits: true,
    query: buildQuery(criteria),
    sort: buildSort(criteria),
    _source: { includes: [...SUMMARY_SOURCE_FIELDS] },
    ...(aggregations ? { aggs: aggregations } : {}),
    ...(highlight ? { highlight } : {}),
  };
}

/** Prefix completion for the high-cardinality fields. */
export function buildSuggestBody(field: SearchField, prefix: string, limit: number): SearchBody {
  const normalised = prefix.trim().toLowerCase();
  return {
    size: 0,
    track_total_hits: false,
    _source: false,
    query: normalised ? nest(field, prefixClause(field, normalised)) : { match_all: {} },
    aggs: {
      [field.key]: facetAggregation(field, limit, normalised ? `${escapeRegexp(normalised)}.*` : undefined),
    },
  };
}

/** `excluded` drops one field's own filter, for the facet that has to keep offering its siblings. */
function buildQuery(
  criteria: SearchCriteria,
  excluded?: SearchField,
): estypes.QueryDslQueryContainer {
  const applied = excluded
    ? criteria.filters.filter((filter) => filter.field.key !== excluded.key)
    : criteria.filters;
  const filter = buildFilterClauses(applied);
  const should = criteria.keywords ? buildKeywordClauses(criteria.keywords) : [];
  if (should.length === 0) return { bool: { must: [{ match_all: {} }], filter } };
  return { bool: { should, minimum_should_match: 1, filter } };
}

export function buildKeywordClauses(keywords: string): estypes.QueryDslQueryContainer[] {
  const flat = KEYWORD_FIELDS.filter((entry) => !nestedPathOf(entry.field));
  const fuzzy = flat.filter((entry) => entry.fuzzy);
  const exact = flat.filter((entry) => !entry.fuzzy);

  const clauses: estypes.QueryDslQueryContainer[] = [];
  if (fuzzy.length > 0) {
    clauses.push({
      multi_match: {
        query: keywords,
        type: 'best_fields',
        fields: boosted(fuzzy),
        fuzziness: 'AUTO',
        prefix_length: 1,
      },
    });
  }
  if (exact.length > 0) {
    clauses.push({ multi_match: { query: keywords, type: 'best_fields', fields: boosted(exact) } });
  }
  if (flat.length > 0) {
    clauses.push({ multi_match: { query: keywords, type: 'phrase_prefix', fields: boosted(flat) } });
  }

  for (const [path, entries] of groupByNestedPath(KEYWORD_FIELDS)) {
    clauses.push({
      nested: {
        path,
        query: { multi_match: { query: keywords, type: 'best_fields', fields: boosted(entries) } },
        score_mode: 'max',
      },
    });
  }
  return clauses;
}

/** Filters sharing a nested path become one `nested` clause. */
export function buildFilterClauses(
  filters: readonly AppliedFilter[],
): estypes.QueryDslQueryContainer[] {
  const clauses: estypes.QueryDslQueryContainer[] = [];
  const byPath = new Map<string, estypes.QueryDslQueryContainer[]>();

  for (const filter of filters) {
    const path = nestedPathOf(filter.field.esField);
    const leaf = leafFilterClause(filter);
    if (!path) {
      clauses.push(leaf);
      continue;
    }
    const group = byPath.get(path);
    if (group) group.push(leaf);
    else byPath.set(path, [leaf]);
  }

  for (const [path, leaves] of byPath) {
    const query = leaves.length === 1 ? leaves[0] : { bool: { filter: leaves } };
    clauses.push({ nested: { path, query, score_mode: 'none' } });
  }

  return clauses;
}

export function buildSort(criteria: SearchCriteria): estypes.SortCombinations[] {
  // Every sort ends on the business key, so equal values page deterministically.
  const tiebreak = ascending('linkedinUsername');
  switch (criteria.sort) {
    case 'relevance':
      // Filters are scoreless, so with no keywords every document ties; fall back to completeness.
      return criteria.keywords
        ? [{ _score: { order: 'desc' } }, tiebreak]
        : [descending('quality.score'), tiebreak];
    case 'name':
      return [ascending('fullName.keyword'), tiebreak];
    case 'connections':
      return [descending('connections'), tiebreak];
    case 'experience':
      return [descending('yearsExperience'), tiebreak];
    case 'quality':
      return [descending('quality.score'), tiebreak];
  }
}

function buildAggregations(
  criteria: SearchCriteria,
): Record<string, estypes.AggregationsAggregationContainer> | undefined {
  const fields = resolveFacetFields(criteria);
  if (fields.length === 0) return undefined;

  const aggregations: Record<string, estypes.AggregationsAggregationContainer> = {};
  for (const field of fields) {
    const values = facetAggregation(field, DEFAULT_FACET_SIZE);
    const selfFiltered = criteria.filters.some((filter) => filter.field.key === field.key);
    aggregations[field.key] = selfFiltered ? rescoped(criteria, field, values) : values;
  }
  return aggregations;
}

function rescoped(
  criteria: SearchCriteria,
  field: SearchField,
  values: estypes.AggregationsAggregationContainer,
): estypes.AggregationsAggregationContainer {
  return {
    global: {},
    aggs: {
      [FACET_SCOPE_AGG]: {
        filter: buildQuery(criteria, field),
        aggs: { [NESTED_VALUES_AGG]: values },
      },
    },
  };
}

/** Only flat text fields are highlighted; a nested one would need inner_hits. */
function buildHighlight(criteria: SearchCriteria): estypes.SearchHighlight | undefined {
  if (!criteria.keywords) return undefined;
  const fields: Record<string, estypes.SearchHighlightField> = {};
  for (const entry of KEYWORD_FIELDS) {
    if (nestedPathOf(entry.field)) continue;
    fields[analyzedFieldFor(entry.field)] = {};
  }
  return {
    fields,
    fragment_size: 120,
    number_of_fragments: 2,
    pre_tags: ['<em>'],
    post_tags: ['</em>'],
  };
}

/** An empty facet list means "everything the registry can facet on". */
export function resolveFacetFields(criteria: SearchCriteria): SearchField[] {
  if (criteria.facets.length === 0) return [...FACETABLE_FIELDS];
  return criteria.facets
    .map((key) => SEARCH_FIELD_BY_KEY.get(key))
    .filter((field): field is SearchField => field !== undefined && field.facetable);
}

/** Shape of the aggregations this builder asks for, narrowed from the client's union response. */
interface FacetAggregationResponse {
  readonly buckets?: readonly {
    readonly key: unknown;
    readonly doc_count: number;
    readonly [PROFILE_COUNT_AGG]?: { readonly doc_count: number };
  }[];
  readonly sum_other_doc_count?: number;
  readonly [NESTED_VALUES_AGG]?: FacetAggregationResponse;
  readonly [FACET_SCOPE_AGG]?: FacetAggregationResponse;
}

export type FacetAggregationMap = Readonly<Record<string, FacetAggregationResponse>>;

export function readFacets(
  criteria: SearchCriteria,
  aggregations: FacetAggregationMap | undefined,
): Facet[] {
  if (!aggregations) return [];
  return resolveFacetFields(criteria)
    .filter((field) => aggregations[field.key] !== undefined)
    .map((field) => readFacet(field, aggregations));
}

export function readFacet(field: SearchField, aggregations: FacetAggregationMap | undefined): Facet {
  const node = aggregations?.[field.key];
  const scoped = node?.[FACET_SCOPE_AGG]?.[NESTED_VALUES_AGG] ?? node;
  const nested = nestedPathOf(field.esField) !== undefined;
  const terms = nested ? scoped?.[NESTED_VALUES_AGG] : scoped;

  const buckets: FacetBucket[] = (terms?.buckets ?? []).map((bucket) => ({
    value: String(bucket.key),
    // A nested bucket counts entries, so reverse_nested climbs back to the person.
    count: nested ? (bucket[PROFILE_COUNT_AGG]?.doc_count ?? 0) : bucket.doc_count,
  }));

  return {
    key: field.key,
    buckets: orderBuckets(field, buckets),
    // Entries rather than people on a nested facet; it only drives an "and N more" hint.
    otherCount: terms?.sum_other_doc_count ?? 0,
  };
}

function leafFilterClause({ field, value }: AppliedFilter): estypes.QueryDslQueryContainer {
  switch (value.type) {
    case 'terms':
      // One clause holding every value: within a filter the values are alternatives.
      return { terms: { [field.esField]: value.values } };
    case 'range': {
      const range: estypes.QueryDslNumberRangeQuery = {};
      if (value.min !== undefined) range.gte = value.min;
      if (value.max !== undefined) range.lte = value.max;
      return { range: { [field.esField]: range } };
    }
    case 'date_range': {
      const range: estypes.QueryDslDateRangeQuery = { format: PARTIAL_DATE_FORMATS };
      if (value.from !== undefined) range.gte = value.from;
      if (value.to !== undefined) range.lte = value.to;
      return { range: { [field.esField]: range } };
    }
    case 'exists':
      return existsClause(field, value.present);
  }
}

/** "Repaired on import" is a boolean every document carries, so `exists` would match everyone. */
function existsClause(field: SearchField, present: boolean): estypes.QueryDslQueryContainer {
  if (isBooleanField(field.esField)) return { term: { [field.esField]: present } };
  return present
    ? { exists: { field: field.esField } }
    : { bool: { must_not: [{ exists: { field: field.esField } }] } };
}

function prefixClause(field: SearchField, prefix: string): estypes.QueryDslQueryContainer {
  const prefixField = prefixFieldFor(field.esField);
  return prefixField
    ? { match: { [prefixField]: { query: prefix, operator: 'and' } } }
    : { prefix: { [field.esField]: { value: prefix } } };
}

function facetAggregation(
  field: SearchField,
  limit: number,
  include?: string,
): estypes.AggregationsAggregationContainer {
  const terms: estypes.AggregationsTermsAggregation = {
    field: field.esField,
    // An ordered vocabulary is reordered on the way out, so no value may be cut off first.
    size: field.options ? Math.max(limit, field.options.length) : limit,
  };
  if (include) terms.include = include;

  const path = nestedPathOf(field.esField);
  if (!path) return { terms };
  return {
    nested: { path },
    aggs: {
      [NESTED_VALUES_AGG]: { terms, aggs: { [PROFILE_COUNT_AGG]: { reverse_nested: {} } } },
    },
  };
}

/** Bands ascend and seniority climbs, so an ordered vocabulary is never returned by count. */
function orderBuckets(field: SearchField, buckets: FacetBucket[]): FacetBucket[] {
  const options = field.options;
  if (!options) return buckets;
  const rank = (bucket: FacetBucket): number => {
    const index = options.indexOf(bucket.value);
    return index === -1 ? options.length : index;
  };
  return [...buckets].sort((left, right) => rank(left) - rank(right));
}

function boosted(entries: readonly { field: string; boost: number }[]): string[] {
  return entries.map((entry) => `${analyzedFieldFor(entry.field)}^${entry.boost}`);
}

function groupByNestedPath<T extends { field: string }>(entries: readonly T[]): Map<string, T[]> {
  const byPath = new Map<string, T[]>();
  for (const entry of entries) {
    const path = nestedPathOf(entry.field);
    if (!path) continue;
    const group = byPath.get(path);
    if (group) group.push(entry);
    else byPath.set(path, [entry]);
  }
  return byPath;
}

/** Whether a field is nested is read from the mapping; the registry does not declare it. */
function nestedPathOf(path: string): string | undefined {
  const [root] = path.split('.');
  if (root === path) return undefined;
  const property = mappingPropertyAt(root);
  return property && 'type' in property && property.type === 'nested' ? root : undefined;
}

function nest(
  field: SearchField,
  clause: estypes.QueryDslQueryContainer,
): estypes.QueryDslQueryContainer {
  const path = nestedPathOf(field.esField);
  return path ? { nested: { path, query: clause, score_mode: 'none' } } : clause;
}

function ascending(field: string): estypes.SortCombinations {
  const order: estypes.FieldSort = { order: 'asc' };
  return { [field]: order };
}

function descending(field: string): estypes.SortCombinations {
  const order: estypes.FieldSort = { order: 'desc', missing: '_last' };
  return { [field]: order };
}

/** Reserved characters in the regexp an aggregation `include` accepts. */
function escapeRegexp(value: string): string {
  return value.replace(/[.?+*|{}[\]()"\\#@&<>~]/g, '\\$&');
}
