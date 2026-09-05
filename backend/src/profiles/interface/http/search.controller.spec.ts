/** The query string is the contract the frontend is written against: */

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PROFILE_SEARCH } from '../../domain/ports/profile-search.port';
import { SEARCH_FIELDS } from '../../domain/search/field-registry';
import { FilterValue, SearchCriteria } from '../../domain/search/search-criteria';
import { GetSearchSchemaUseCase, SearchSchema } from '../../application/get-search-schema.use-case';
import { SearchProfilesUseCase } from '../../application/search-profiles.use-case';
import { SuggestValuesUseCase } from '../../application/suggest-values.use-case';
import { asProblem, createHttpApp } from 'src/test/http/app';
import { FakeProfileSearch } from 'src/test/fakes';
import { SearchController } from './search.controller';

describe('the search endpoints', () => {
  let app: INestApplication;
  let search: FakeProfileSearch;

  beforeAll(async () => {
    search = new FakeProfileSearch();
    app = await createHttpApp({
      controllers: [SearchController],
      providers: [
        SearchProfilesUseCase,
        GetSearchSchemaUseCase,
        SuggestValuesUseCase,
        { provide: PROFILE_SEARCH, useValue: search },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(path);

  const filtersOf = (criteria: SearchCriteria): Record<string, FilterValue> =>
    Object.fromEntries(criteria.filters.map((applied) => [applied.field.key, applied.value]));

  describe('GET /api/search', () => {
    it('passes the documented query string on as one set of criteria', async () => {
      const response = await get(
        '/api/search?q=%20growth%20marketing%20&sort=connections&page=3&size=25&facets=skills,industry',
      );

      expect(response.status).toBe(200);
      expect(search.lastCriteria.keywords).toBe('growth marketing');
      expect(search.lastCriteria.sort).toBe('connections');
      expect(search.lastCriteria.pagination).toEqual({ page: 3, size: 25 });
      expect(search.lastCriteria.facets).toEqual(['skills', 'industry']);
      expect(search.lastCriteria.from).toBe(50);
    });

    it('browses the whole corpus when nothing is asked for', async () => {
      await get('/api/search');

      expect(search.lastCriteria.keywords).toBeUndefined();
      expect(search.lastCriteria.filters).toEqual([]);
      expect(search.lastCriteria.sort).toBe('relevance');
      expect(search.lastCriteria.pagination).toEqual({ page: 1, size: 20 });
    });

    it('reads every filter kind out of the flat f.<key> parameters', async () => {
      await get(
        '/api/search?f.skills=leadership,training&f.yearsExperience=5..15&f.graduationYear=2000..2010&f.hasGithub=true',
      );

      expect(filtersOf(search.lastCriteria)).toEqual({
        skills: { type: 'terms', values: ['leadership', 'training'] },
        yearsExperience: { type: 'range', min: 5, max: 15 },
        graduationYear: { type: 'date_range', from: '2000', to: '2010' },
        hasGithub: { type: 'exists', present: true },
      });
    });

    it('keeps a comma that is part of a value, which is how the salary bands travel', async () => {
      await get('/api/search?f.salaryBand=%3C20%2C000,%3E250%2C000');

      expect(filtersOf(search.lastCriteria).salaryBand).toEqual({
        type: 'terms',
        values: ['<20,000', '>250,000'],
      });
    });

    it('canonicalises a closed vocabulary so a capitalised chip still matches the corpus', async () => {
      await get('/api/search?f.seniority=CXO,Director');

      expect(filtersOf(search.lastCriteria).seniority).toEqual({
        type: 'terms',
        values: ['cxo', 'director'],
      });
    });

    it('ignores a filter parameter that carries no value, so an empty box filters nothing', async () => {
      await get('/api/search?f.skills=&f.yearsExperience=&f.hasGithub=');

      expect(search.lastCriteria.filters).toEqual([]);
    });

    it('combines a filter that was sent as repeated parameters', async () => {
      await get('/api/search?f.skills=leadership&f.skills=training,hiring');

      expect(filtersOf(search.lastCriteria).skills).toEqual({
        type: 'terms',
        values: ['leadership', 'training', 'hiring'],
      });
    });

    it('drops a value repeated within one filter', async () => {
      await get('/api/search?f.skills=leadership,leadership');

      expect(filtersOf(search.lastCriteria).skills).toEqual({
        type: 'terms',
        values: ['leadership'],
      });
    });

    it('refuses a query parameter the endpoint does not know, rather than ignoring it', async () => {
      const response = await get('/api/search?pagesize=20');

      expect(response.status).toBe(400);
      expect(asProblem(response.body).errors?.pagesize).toBeDefined();
    });

    it('accepts a range with one end left open', async () => {
      await get('/api/search?f.yearsExperience=5..&f.companyFounded=..1999');

      expect(filtersOf(search.lastCriteria)).toEqual({
        yearsExperience: { type: 'range', min: 5 },
        companyFounded: { type: 'range', max: 1999 },
      });
    });

    it('names the offending parameter when a filter field is unknown, rather than failing', async () => {
      const response = await get('/api/search?f.favouriteColour=blue');

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(asProblem(response.body).errors?.['f.favouriteColour']).toBeDefined();
    });

    it.each([
      ['a range that is not a range', 'f.yearsExperience=5-15', 'f.yearsExperience'],
      ['a bound that is not a number', 'f.yearsExperience=five..ten', 'f.yearsExperience'],
      ['a lower bound above the upper', 'f.yearsExperience=15..5', 'f.yearsExperience'],
      ['a year that is not a date', 'f.graduationYear=recently..2010', 'f.graduationYear'],
      ['a toggle that is not a boolean', 'f.hasGithub=maybe', 'f.hasGithub'],
      ['a value outside a closed vocabulary', 'f.seniority=wizard', 'f.seniority'],
    ])('answers %s with a 400 keyed by the parameter', async (_label, query, parameter) => {
      const response = await get(`/api/search?${query}`);
      const problem = asProblem(response.body);

      expect(response.status).toBe(400);
      expect(problem.errors?.[parameter]).toBeDefined();
      expect(problem.detail.length).toBeGreaterThan(0);
    });

    it('lists the vocabulary when a value is not one of its options', async () => {
      const response = await get('/api/search?f.seniority=wizard');

      expect(asProblem(response.body).detail).toContain('cxo');
    });

    it.each([
      ['a page that is not a number', 'page=first', 'page'],
      ['a page below one', 'page=0', 'page'],
      ['a fractional page', 'page=1.5', 'page'],
      ['a size above the maximum', 'size=101', 'size'],
      ['a size below one', 'size=0', 'size'],
      ['an unknown sort order', 'sort=alphabetical', 'sort'],
      ['an unknown facet', 'facets=skills,horoscope', 'facets'],
      ['keywords past the length limit', `q=${'x'.repeat(201)}`, 'q'],
    ])('answers %s with a 400 naming the parameter', async (_label, query, parameter) => {
      const response = await get(`/api/search?${query}`);

      expect(response.status).toBe(400);
      expect(asProblem(response.body).errors?.[parameter]).toBeDefined();
    });

    it('accepts the largest page size the schema advertises', async () => {
      const response = await get('/api/search?size=100');

      expect(response.status).toBe(200);
      expect(search.lastCriteria.pagination.size).toBe(100);
    });

    it('refuses to page past the result window and says so on the page parameter', async () => {
      const response = await get('/api/search?page=501&size=20');
      const problem = asProblem(response.body);

      expect(response.status).toBe(400);
      expect(problem.errors?.page).toBeDefined();
      expect(problem.detail).toContain('Narrow the search');
    });

    it('returns the page the port produced, unchanged', async () => {
      search.result = {
        items: [
          {
            linkedinUsername: 'ada-lovelace',
            fullName: 'ada lovelace',
            skills: ['analytical engines'],
            totalSkills: 1,
            qualityScore: 0.9,
            repaired: false,
          },
        ],
        total: 1,
        page: 1,
        size: 20,
        facets: [{ key: 'skills', buckets: [{ value: 'analytical engines', count: 1 }], otherCount: 0 }],
        tookMs: 7,
      };

      const response = await get('/api/search?q=ada');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(search.result);
    });
  });

  describe('GET /api/search/schema', () => {
    it('publishes every registry field with what a client needs to draw it', async () => {
      const response = await get('/api/search/schema');
      const schema = response.body as SearchSchema;

      expect(response.status).toBe(200);
      expect(schema.fields).toHaveLength(SEARCH_FIELDS.length);
      expect(schema.fields.map((field) => field.key)).toEqual(SEARCH_FIELDS.map((f) => f.key));
      for (const field of schema.fields) {
        expect(typeof field.label).toBe('string');
        expect(typeof field.group).toBe('string');
        expect(typeof field.facetable).toBe('boolean');
        expect(['terms', 'ordered_terms', 'range', 'date_range', 'exists']).toContain(field.kind);
      }
    });

    it('leaks no Elasticsearch field path', async () => {
      const response = await get('/api/search/schema');
      const body = JSON.stringify(response.body);

      for (const field of (response.body as SearchSchema).fields) {
        expect(field).not.toHaveProperty('esField');
      }
      for (const path of SEARCH_FIELDS.map((field) => field.esField).filter((p) => p.includes('.'))) {
        expect(body).not.toContain(path);
      }
      expect(body).not.toContain('jobLevels');
    });

    it('carries each closed vocabulary in its natural order, for chips rather than a slider', async () => {
      const schema = (await get('/api/search/schema')).body as SearchSchema;
      const byKey = new Map(schema.fields.map((field) => [field.key, field]));

      expect(byKey.get('salaryBand')?.options).toHaveLength(11);
      expect(byKey.get('companySize')?.options).toHaveLength(8);
      expect(byKey.get('seniority')?.options).toEqual([
        'unpaid',
        'training',
        'entry',
        'senior',
        'manager',
        'director',
        'vp',
        'partner',
        'cxo',
        'owner',
      ]);
    });

    it('names the sort orders and the groups the panel is sectioned by', async () => {
      const schema = (await get('/api/search/schema')).body as SearchSchema;

      expect(schema.sorts.map((sort) => sort.key)).toEqual([
        'relevance',
        'name',
        'connections',
        'experience',
        'quality',
      ]);
      expect(schema.groups).toEqual([...new Set(schema.fields.map((field) => field.group))]);
    });
  });

  describe('GET /api/search/suggest', () => {
    it('completes a high-cardinality field from the index, lower-cased', async () => {
      search.suggestions = ['leadership', 'lead generation'];

      const response = await get('/api/search/suggest?field=skills&q=Lead');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ values: ['leadership', 'lead generation'] });
      expect(search.suggestCalls.at(-1)).toEqual({ fieldKey: 'skills', prefix: 'lead', limit: 10 });
    });

    it('honours the requested limit', async () => {
      await get('/api/search/suggest?field=skills&q=lead&limit=25');

      expect(search.suggestCalls.at(-1)?.limit).toBe(25);
    });

    it('answers a closed vocabulary from the registry without touching the index', async () => {
      const before = search.suggestCalls.length;

      const response = await get('/api/search/suggest?field=companySize&q=1');

      expect(response.body).toEqual({ values: ['1-10', '11-50', '1001-5000', '10001+'] });
      expect(search.suggestCalls).toHaveLength(before);
    });

    it.each([
      ['an unknown field', 'field=horoscope'],
      ['a field that holds numbers', 'field=yearsExperience'],
      ['a field that holds a yes or no', 'field=hasGithub'],
    ])('refuses %s with a 400 on the field parameter', async (_label, query) => {
      const response = await get(`/api/search/suggest?${query}&q=a`);

      expect(response.status).toBe(400);
      expect(asProblem(response.body).errors?.field).toBeDefined();
    });

    it('completes from an empty prefix when the box has not been typed in yet', async () => {
      search.suggestions = ['leadership'];

      const response = await get('/api/search/suggest?field=skills');

      expect(response.status).toBe(200);
      expect(search.suggestCalls.at(-1)).toEqual({ fieldKey: 'skills', prefix: '', limit: 10 });
    });

    it.each([
      ['no field at all', ''],
      ['a limit above the maximum', 'field=skills&limit=51'],
      ['a limit that is not a number', 'field=skills&limit=lots'],
    ])('rejects %s with a 400', async (_label, query) => {
      const response = await get(`/api/search/suggest?${query}`);

      expect(response.status).toBe(400);
    });
  });

  describe('a search driver that is down', () => {
    afterEach(() => {
      search.unavailable = null;
    });

    it('does not report an unreachable index as a bad query', async () => {
      search.unavailable = new Error('connect ECONNREFUSED 127.0.0.1:9200');

      const response = await get('/api/search?q=growth');

      expect(response.status).toBe(500);
      expect(asProblem(response.body).detail).toBe('An unexpected error occurred');
    });

    it('does not report an unreachable index as a bad field either', async () => {
      search.unavailable = new Error('connect ECONNREFUSED 127.0.0.1:9200');

      const response = await get('/api/search/suggest?field=skills&q=lead');

      expect(response.status).toBe(500);
      expect(asProblem(response.body).errors).toBeUndefined();
    });
  });
});
