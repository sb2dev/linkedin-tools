/** The frontend holds no field list of its own: */

import {
  COMPANY_SIZE_ORDER,
  SALARY_BAND_ORDER,
  SEARCH_FIELDS,
  SENIORITY_ORDER,
  SearchField,
} from '../domain/search/field-registry';
import { FilterValue, SearchCriteria } from '../domain/search/search-criteria';
import { GetSearchSchemaUseCase, PublishedField } from './get-search-schema.use-case';
import { NotSuggestableFieldError, SuggestValuesUseCase } from './suggest-values.use-case';
import { FakeProfileSearch } from 'src/test/fakes';

const schema = new GetSearchSchemaUseCase().execute();

/** Index paths that would tell a client how the documents are shaped. None may be published. */
const INTERNAL_PATHS = [
  'experience.companyName',
  'experience.title',
  'education.schoolName',
  'education.majors',
  'education.endDate',
  'companyLocation.country',
  'languages.name',
  'certifications.name',
  'quality.score',
  'quality.repaired',
  'jobLevels',
  'jobStartDate',
];

function published(key: string): PublishedField {
  const field = schema.fields.find((candidate) => candidate.key === key);
  if (!field) throw new Error(`the schema no longer publishes "${key}"`);
  return field;
}

/** A value of the right shape for the field's kind, as the UI would send one back. */
function sampleValue(field: SearchField | PublishedField): FilterValue {
  switch (field.kind) {
    case 'terms':
    case 'ordered_terms':
      return { type: 'terms', values: [field.options?.[0] ?? 'anything'] };
    case 'range':
      return { type: 'range', min: 1, max: 2 };
    case 'date_range':
      return { type: 'date_range', from: '2000', to: '2010' };
    case 'exists':
      return { type: 'exists', present: true };
  }
}

describe('what is published', () => {
  it('publishes every field the registry declares, in registry order', () => {
    expect(schema.fields.map((field) => field.key)).toEqual(SEARCH_FIELDS.map((f) => f.key));
  });

  it('publishes the label, group, kind and hint a panel needs to render a field', () => {
    expect(published('salaryBand')).toEqual({
      key: 'salaryBand',
      label: 'Salary band',
      group: 'Career',
      kind: 'ordered_terms',
      facetable: true,
      options: SALARY_BAND_ORDER,
      primary: true,
      hint: 'Inferred by the source; a band, not a figure',
    });
  });

  it('names its groups once each, in the order the registry first mentions them', () => {
    expect(schema.groups).toEqual([
      'Expertise',
      'Career',
      'Company',
      'Past roles',
      'Education',
      'Location',
      'Person',
      'Data quality',
    ]);
  });

  it('lists the sort options with the default first, so a client can render them as given', () => {
    expect(schema.sorts.map((sort) => sort.key)).toEqual([
      'relevance',
      'name',
      'connections',
      'experience',
      'quality',
    ]);
    expect(schema.sorts[0]).toEqual({ key: 'relevance', label: 'Best match' });
  });

  it('publishes the same schema on every call, so two clients never disagree', () => {
    expect(new GetSearchSchemaUseCase().execute()).toEqual(schema);
  });
});

describe('what is withheld', () => {
  it('never publishes the Elasticsearch field path', () => {
    for (const field of schema.fields) expect(field).not.toHaveProperty('esField');
  });

  it('leaks no document path or nesting hint anywhere in the payload', () => {
    const body = JSON.stringify(schema);

    expect(body).not.toContain('esField');
    for (const path of INTERNAL_PATHS) expect(body).not.toContain(path);
  });
});

describe('what a client can do with it', () => {
  it('publishes only keys the search endpoint will accept back as a filter', () => {
    for (const field of schema.fields) {
      const build = () =>
        SearchCriteria.create({ filters: { [field.key]: sampleValue(field) } });

      expect(build).not.toThrow();
      expect(build().filters).toHaveLength(1);
    }
  });

  it('gives every ordered vocabulary in full, in its natural order rather than alphabetically', () => {
    expect(published('salaryBand').options).toEqual(SALARY_BAND_ORDER);
    expect(published('companySize').options).toEqual(COMPANY_SIZE_ORDER);
    expect(published('seniority').options).toEqual(SENIORITY_ORDER);
    expect(published('salaryBand').options).toHaveLength(11);
    expect(published('companySize').options).toHaveLength(8);
    expect(published('seniority').options).toHaveLength(10);
  });

  it('marks a field as a typeahead only when the suggest endpoint will answer for it', async () => {
    const suggest = new SuggestValuesUseCase(new FakeProfileSearch());
    const typeaheads = schema.fields.filter((field) => field.typeahead);

    expect(typeaheads.length).toBeGreaterThan(0);
    for (const field of typeaheads) {
      await expect(suggest.execute(field.key, 'a')).resolves.toBeDefined();
    }
  });

  it('marks a field as facetable only when it holds discrete values to count', () => {
    for (const field of schema.fields) {
      if (!field.facetable) continue;
      expect(field.kind).toMatch(/^(terms|ordered_terms)$/);
    }
  });

  it('never offers a typeahead on a field that holds numbers or a yes/no', async () => {
    const suggest = new SuggestValuesUseCase(new FakeProfileSearch());
    const numeric = schema.fields.filter(
      (field) => field.kind === 'range' || field.kind === 'exists' || field.kind === 'date_range',
    );

    for (const field of numeric) {
      expect(field.typeahead).toBeUndefined();
      await expect(suggest.execute(field.key, 'a')).rejects.toBeInstanceOf(
        NotSuggestableFieldError,
      );
    }
  });
});
