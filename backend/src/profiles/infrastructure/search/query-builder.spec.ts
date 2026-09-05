import { estypes } from '@elastic/elasticsearch';

import {
  KEYWORD_FIELDS,
  SALARY_BAND_ORDER,
  SEARCH_FIELDS,
  SEARCH_FIELD_BY_KEY,
  SearchField,
} from '../../domain/search/field-registry';
import { SearchCriteria } from '../../domain/search/search-criteria';
import { analyzedFieldFor, mappingPropertyAt } from './profile.mapping';
import {
  FacetAggregationMap,
  SearchBody,
  buildFilterClauses,
  buildKeywordClauses,
  buildSearchBody,
  buildSort,
  buildSuggestBody,
  readFacet,
  readFacets,
  resolveFacetFields,
} from './query-builder';

function field(key: string): SearchField {
  const found = SEARCH_FIELD_BY_KEY.get(key);
  if (!found) throw new Error(`no such field: ${key}`);
  return found;
}

function boolOf(body: SearchBody): estypes.QueryDslBoolQuery {
  const bool = (body.query as estypes.QueryDslQueryContainer).bool;
  if (!bool) throw new Error('expected a bool query');
  return bool;
}

function clausesOf(
  clause: estypes.QueryDslQueryContainer | estypes.QueryDslQueryContainer[] | undefined,
): estypes.QueryDslQueryContainer[] {
  if (!clause) return [];
  return Array.isArray(clause) ? clause : [clause];
}

function fieldsOf(clause: estypes.QueryDslQueryContainer): string[] {
  const fields = clause.multi_match?.fields;
  if (!fields) return [];
  return Array.isArray(fields) ? fields : [fields];
}

function multiMatchClauses(keywords: string): estypes.QueryDslQueryContainer[] {
  return buildKeywordClauses(keywords).filter((clause) => clause.multi_match !== undefined);
}

describe('keyword clauses', () => {
  it('applies the registry boosts to the analysed form of each field', () => {
    const fields = fieldsOf(multiMatchClauses('ada')[0]);

    expect(fields).toContain('fullName^6');
    expect(fields).toContain('jobTitle.text^4');
  });

  it('asks for fuzziness only on the fields flagged for it', () => {
    const [fuzzy, exact] = multiMatchClauses('ada');

    expect(fuzzy.multi_match?.fuzziness).toBe('AUTO');
    expect(fieldsOf(fuzzy)).toEqual(['fullName^6', 'jobTitle.text^4', 'companyName.text^2.5']);
    expect(exact.multi_match?.fuzziness).toBeUndefined();
    expect(fieldsOf(exact)).toContain('skills.text^3');
  });

  it('adds a phrase_prefix clause so a half-typed word still matches', () => {
    const types = multiMatchClauses('ada').map((clause) => clause.multi_match?.type);

    expect(types).toContain('phrase_prefix');
  });

  it('routes nested fields through nested queries and never through a flat multi_match', () => {
    const clauses = buildKeywordClauses('ada');
    const nested = clauses.filter((clause) => clause.nested !== undefined);

    expect(nested.map((clause) => clause.nested?.path)).toEqual(['experience', 'education']);
    expect(fieldsOf(nested[0].nested?.query as estypes.QueryDslQueryContainer)).toEqual([
      'experience.title.text^1.5',
      'experience.companyName.text^1.5',
    ]);
    for (const clause of multiMatchClauses('ada')) {
      expect(fieldsOf(clause).some((name) => name.startsWith('experience.'))).toBe(false);
    }
  });
});

describe('filters', () => {
  it('puts every filter clause in filter context, leaving the scoring clauses alone', () => {
    const body = buildSearchBody(
      SearchCriteria.create({
        keywords: 'ada',
        filters: { country: { type: 'terms', values: ['united states'] } },
      }),
    );
    const bool = boolOf(body);

    expect(clausesOf(bool.filter)).toHaveLength(1);
    expect(bool.must).toBeUndefined();
    expect(clausesOf(bool.should).every((clause) => clause.terms === undefined)).toBe(true);
  });

  it('ORs the values within one filter and ANDs across filters', () => {
    const body = buildSearchBody(
      SearchCriteria.create({
        filters: {
          skills: { type: 'terms', values: ['leadership', 'training'] },
          country: { type: 'terms', values: ['united states'] },
        },
      }),
    );
    const filters = clausesOf(boolOf(body).filter);

    expect(filters).toHaveLength(2);
    expect(filters[0].terms?.skills).toEqual(['leadership', 'training']);
    expect(filters[1].terms?.country).toEqual(['united states']);
  });

  it('bounds a range at both ends when both were given', () => {
    const [clause] = buildFilterClauses([
      { field: field('yearsExperience'), value: { type: 'range', min: 5, max: 15 } },
    ]);

    expect(clause.range?.yearsExperience).toEqual({ gte: 5, lte: 15 });
  });

  it('leaves an open-ended range open', () => {
    const [clause] = buildFilterClauses([
      { field: field('yearsExperience'), value: { type: 'range', min: 5 } },
    ]);

    expect(clause.range?.yearsExperience).toEqual({ gte: 5 });
  });

  it('sends partial dates with the format that lets Elasticsearch round them', () => {
    const [clause] = buildFilterClauses([
      { field: field('graduationYear'), value: { type: 'date_range', from: '2000', to: '2010' } },
    ]);
    const inner = clause.nested?.query as estypes.QueryDslQueryContainer;

    expect(clause.nested?.path).toBe('education');
    expect(inner.range?.['education.endDate']).toEqual({
      format: 'yyyy-MM-dd||yyyy-MM||yyyy',
      gte: '2000',
      lte: '2010',
    });
  });

  it('wraps a nested filter in a nested query on its own path', () => {
    const [clause] = buildFilterClauses([
      { field: field('pastCompany'), value: { type: 'terms', values: ['acme'] } },
    ]);
    const inner = clause.nested?.query as estypes.QueryDslQueryContainer;

    expect(clause.nested?.path).toBe('experience');
    expect(inner.terms?.['experience.companyName']).toEqual(['acme']);
  });

  it('puts two filters on one nested path inside a single nested clause', () => {
    const clauses = buildFilterClauses([
      { field: field('pastCompany'), value: { type: 'terms', values: ['acme'] } },
      { field: field('pastTitle'), value: { type: 'terms', values: ['engineer'] } },
    ]);
    const inner = clauses[0].nested?.query as estypes.QueryDslQueryContainer;
    const leaves = clausesOf(inner.bool?.filter);

    expect(clauses).toHaveLength(1);
    expect(clauses[0].nested?.path).toBe('experience');
    expect(leaves[0].terms?.['experience.companyName']).toEqual(['acme']);
    expect(leaves[1].terms?.['experience.title']).toEqual(['engineer']);
  });

  it('keeps filters on different nested paths in separate clauses', () => {
    const clauses = buildFilterClauses([
      { field: field('pastCompany'), value: { type: 'terms', values: ['acme'] } },
      { field: field('school'), value: { type: 'terms', values: ['mit'] } },
    ]);

    expect(clauses.map((clause) => clause.nested?.path)).toEqual(['experience', 'education']);
  });

  it('reads presence as existence, and as a term when the field is a boolean', () => {
    const [present] = buildFilterClauses([
      { field: field('hasGithub'), value: { type: 'exists', present: true } },
    ]);
    const [absent] = buildFilterClauses([
      { field: field('hasGithub'), value: { type: 'exists', present: false } },
    ]);
    const [repaired] = buildFilterClauses([
      { field: field('wasRepaired'), value: { type: 'exists', present: true } },
    ]);

    expect(present.exists?.field).toBe('githubUsername');
    expect(clausesOf(absent.bool?.must_not)[0].exists?.field).toBe('githubUsername');
    expect(repaired.term?.['quality.repaired']).toBe(true);
  });
});

describe('browse', () => {
  it('matches everything and does not highlight when there is nothing to highlight', () => {
    const body = buildSearchBody(SearchCriteria.create({}));

    expect(clausesOf(boolOf(body).must)[0].match_all).toEqual({});
    expect(boolOf(body).should).toBeUndefined();
    expect(body.highlight).toBeUndefined();
  });

  it('fetches only the fields a result row shows', () => {
    const body = buildSearchBody(SearchCriteria.create({}));
    const source = body._source as estypes.SearchSourceFilter;

    expect(source.includes).toContain('linkedinUsername');
    expect(source.includes).not.toContain('summary');
    expect(body.track_total_hits).toBe(true);
  });
});

describe('sorting', () => {
  it('breaks every tie on the business key so pages are stable', () => {
    for (const sort of ['relevance', 'name', 'connections', 'experience', 'quality'] as const) {
      const clauses = buildSort(SearchCriteria.create({ keywords: 'ada', sort }));

      expect(clauses).toHaveLength(2);
      expect(clauses[1]).toEqual({ linkedinUsername: { order: 'asc' } });
    }
  });

  it('scores by relevance only when there are keywords to be relevant to', () => {
    const searched = buildSort(SearchCriteria.create({ keywords: 'ada' }));
    const browsed = buildSort(SearchCriteria.create({}));

    expect(searched[0]).toEqual({ _score: { order: 'desc' } });
    expect(browsed[0]).toEqual({ 'quality.score': { order: 'desc', missing: '_last' } });
  });

  it('sorts names on the keyword sub-field, which is the sortable one', () => {
    expect(buildSort(SearchCriteria.create({ sort: 'name' }))[0]).toEqual({
      'fullName.keyword': { order: 'asc' },
    });
  });
});

describe('facets', () => {
  it('aggregates the requested facetable fields and nothing else', () => {
    const body = buildSearchBody(SearchCriteria.create({ facets: ['skills', 'yearsExperience', 'nope'] }));

    expect(Object.keys(body.aggs ?? {})).toEqual(['skills']);
    expect(body.aggs?.skills.terms?.field).toBe('skills');
  });

  it('defaults to every facetable field so one request can fill every filter', () => {
    const keys = resolveFacetFields(SearchCriteria.create({})).map((one) => one.key);

    expect(keys).toContain('industry');
    expect(keys).not.toContain('yearsExperience');
  });

  it('counts a nested facet with reverse_nested, so buckets count people not entries', () => {
    const body = buildSearchBody(SearchCriteria.create({ facets: ['pastCompany'] }));
    const values = body.aggs?.pastCompany.aggs?.values;

    expect(body.aggs?.pastCompany.nested?.path).toBe('experience');
    expect(values?.terms?.field).toBe('experience.companyName');
    expect(values?.aggs?.profiles.reverse_nested).toEqual({});
  });

  it('reads the reverse_nested count rather than the entry count', () => {
    const aggregations: FacetAggregationMap = {
      pastCompany: {
        values: {
          buckets: [{ key: 'acme', doc_count: 7, profiles: { doc_count: 4 } }],
          sum_other_doc_count: 9,
        },
      },
    };

    const facet = readFacet(field('pastCompany'), aggregations);

    expect(facet.buckets).toEqual([{ value: 'acme', count: 4 }]);
    expect(facet.otherCount).toBe(9);
  });

  it('returns an ordered vocabulary in its own order, not by count', () => {
    const aggregations: FacetAggregationMap = {
      salaryBand: {
        buckets: [
          { key: '>250,000', doc_count: 40 },
          { key: '<20,000', doc_count: 5 },
          { key: '45,000-55,000', doc_count: 12 },
        ],
        sum_other_doc_count: 0,
      },
    };

    const values = readFacet(field('salaryBand'), aggregations).buckets.map((bucket) => bucket.value);

    expect(values).toEqual(['<20,000', '45,000-55,000', '>250,000']);
    expect(values).toEqual(SALARY_BAND_ORDER.filter((band) => values.includes(band)));
  });

  it('asks for every band of an ordered vocabulary, so none is cut before it is reordered', () => {
    const body = buildSuggestBody(field('salaryBand'), '', 3);

    expect(body.aggs?.salaryBand.terms?.size).toBe(SALARY_BAND_ORDER.length);
  });

  it('lifts a field own filter off its bucket list, so a second value can still be picked', () => {
    const body = buildSearchBody(
      SearchCriteria.create({
        filters: {
          country: { type: 'terms', values: ['united states'] },
          industry: { type: 'terms', values: ['banking'] },
        },
        facets: ['country', 'industry'],
      }),
    );
    const scope = body.aggs?.country.aggs?.scope;
    const rescoped = clausesOf((scope?.filter as estypes.QueryDslQueryContainer).bool?.filter);

    expect(body.aggs?.country.global).toEqual({});
    expect(rescoped).toHaveLength(1);
    expect(rescoped[0].terms?.industry).toEqual(['banking']);
    expect(scope?.aggs?.values.terms?.field).toBe('country');
  });

  it('leaves an unfiltered facet on the query itself', () => {
    const body = buildSearchBody(
      SearchCriteria.create({
        filters: { country: { type: 'terms', values: ['united states'] } },
        facets: ['industry'],
      }),
    );

    expect(body.aggs?.industry.global).toBeUndefined();
    expect(body.aggs?.industry.terms?.field).toBe('industry');
  });

  it('reads an aggregation the cluster left out as an empty facet rather than throwing', () => {
    const facet = readFacet(field('country'), undefined);

    expect(facet).toEqual({ key: 'country', buckets: [], otherCount: 0 });
  });

  it('asks for no aggregations at all when nothing requested is facetable', () => {
    const body = buildSearchBody(SearchCriteria.create({ facets: ['yearsExperience'] }));

    expect(body.aggs).toBeUndefined();
    expect('aggs' in body).toBe(false);
  });

  it('reads back only the facets the cluster answered, in registry order', () => {
    const criteria = SearchCriteria.create({ facets: ['country', 'industry'] });
    const aggregations: FacetAggregationMap = {
      country: { buckets: [{ key: 'france', doc_count: 3 }], sum_other_doc_count: 0 },
    };

    const facets = readFacets(criteria, aggregations);

    // `industry` was asked for and not answered, which is what a cluster mid-reindex does.
    expect(facets.map((facet) => facet.key)).toEqual(['country']);
    expect(facets[0].buckets).toEqual([{ value: 'france', count: 3 }]);
  });

  it('sorts a value the vocabulary does not know to the end rather than to the front', () => {
    const aggregations: FacetAggregationMap = {
      salaryBand: {
        buckets: [
          { key: 'competitive', doc_count: 90 },
          { key: '<20,000', doc_count: 5 },
        ],
        sum_other_doc_count: 0,
      },
    };

    const values = readFacet(field('salaryBand'), aggregations).buckets.map((bucket) => bucket.value);

    expect(values).toEqual(['<20,000', 'competitive']);
  });

  it('counts a nested bucket the cluster sent no profile count for as none', () => {
    const aggregations: FacetAggregationMap = {
      pastCompany: {
        values: { buckets: [{ key: 'acme', doc_count: 7 }], sum_other_doc_count: 0 },
      },
    };

    expect(readFacet(field('pastCompany'), aggregations).buckets).toEqual([
      { value: 'acme', count: 0 },
    ]);
  });

  it('reads the buckets back out of the re-scoped shape', () => {
    const aggregations: FacetAggregationMap = {
      country: { scope: { values: { buckets: [{ key: 'france', doc_count: 3 }] } } },
    };

    expect(readFacet(field('country'), aggregations).buckets).toEqual([
      { value: 'france', count: 3 },
    ]);
  });
});

describe('highlighting', () => {
  it('marks fragments with the tags the API documents and the client parses', () => {
    const body = buildSearchBody(SearchCriteria.create({ keywords: 'growth' }));

    expect(body.highlight?.pre_tags).toEqual(['<em>']);
    expect(body.highlight?.post_tags).toEqual(['</em>']);
    expect(Object.keys(body.highlight?.fields ?? {})).toContain('jobTitle.text');
  });

  it('highlights no nested field, which would need inner_hits to render', () => {
    const body = buildSearchBody(SearchCriteria.create({ keywords: 'growth' }));
    const fields = Object.keys(body.highlight?.fields ?? {});

    expect(fields.some((name) => name.startsWith('experience.'))).toBe(false);
  });
});

describe('suggestions', () => {
  it('completes on the prefix sub-field and keeps a profile other values out of the buckets', () => {
    const body = buildSuggestBody(field('skills'), '  Lead ', 10);
    const query = body.query as estypes.QueryDslQueryContainer;

    expect(query.match?.['skills.prefix']).toEqual({ query: 'lead', operator: 'and' });
    expect(body.aggs?.skills.terms?.include).toBe('lead.*');
    expect(body.size).toBe(0);
  });

  it('escapes what the aggregation would otherwise read as a regular expression', () => {
    const body = buildSuggestBody(field('skills'), 'c++', 10);

    expect(body.aggs?.skills.terms?.include).toBe('c\\+\\+.*');
  });

  it('completes inside a nested path through a nested query', () => {
    const body = buildSuggestBody(field('school'), 'stan', 5);
    const query = body.query as estypes.QueryDslQueryContainer;
    const inner = query.nested?.query as estypes.QueryDslQueryContainer;

    expect(query.nested?.path).toBe('education');
    expect(inner.match?.['education.schoolName.prefix']).toEqual({ query: 'stan', operator: 'and' });
  });

  it('completes a field with no edge-ngram form with a plain prefix query', () => {
    const body = buildSuggestBody(field('country'), 'fra', 5);

    expect((body.query as estypes.QueryDslQueryContainer).prefix?.country).toEqual({ value: 'fra' });
  });
});

describe('registry and mapping', () => {
  it('names a mapped field in every entry that reaches the query builder', () => {
    const unmapped = [
      ...SEARCH_FIELDS.map((one) => ({ key: one.key, path: one.esField })),
      ...KEYWORD_FIELDS.map((one) => ({ key: one.field, path: one.field })),
    ].filter((one) => mappingPropertyAt(one.path) === undefined);

    expect(unmapped.map((one) => one.key)).toEqual([]);
  });

  it('matches a keyword field with no analysed form on the field itself', () => {
    // companySize is an exact vocabulary, so it carries no `.text` sub-field.
    expect(analyzedFieldFor('companySize')).toBe('companySize');
    expect(analyzedFieldFor('jobTitle')).toBe('jobTitle.text');
  });

  it('completes every typeahead field on an edge_ngram sub-field, not a term prefix scan', () => {
    const typeahead = SEARCH_FIELDS.filter((one) => one.typeahead);

    const scanned = typeahead.filter((one) => {
      const query = buildSuggestBody(one, 'a', 5).query as estypes.QueryDslQueryContainer;
      const leaf = (query.nested?.query) ?? query;
      return leaf.match === undefined;
    });

    expect(typeahead.length).toBeGreaterThan(0);
    expect(scanned.map((one) => one.key)).toEqual([]);
  });
});
