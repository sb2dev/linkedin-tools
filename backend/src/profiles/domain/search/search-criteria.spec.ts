import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_RESULT_WINDOW,
  SearchCriteria,
  UnknownFilterFieldError,
} from './search-criteria';

describe('how much of the corpus one request can ask for', () => {
  it('caps the page size, so one caller cannot ask the cluster for the whole corpus at once', () => {
    expect(SearchCriteria.create({ size: 10_000 }).pagination.size).toBe(MAX_PAGE_SIZE);
    expect(SearchCriteria.create({ size: MAX_PAGE_SIZE + 1 }).pagination.size).toBe(MAX_PAGE_SIZE);
  });

  it('keeps a size the cap allows exactly as asked', () => {
    expect(SearchCriteria.create({ size: MAX_PAGE_SIZE }).pagination.size).toBe(MAX_PAGE_SIZE);
    expect(SearchCriteria.create({ size: 1 }).pagination.size).toBe(1);
  });

  it('answers with a page of results rather than none when the size makes no sense', () => {
    expect(SearchCriteria.create({ size: 0 }).pagination.size).toBe(1);
    expect(SearchCriteria.create({ size: -25 }).pagination.size).toBe(1);
    expect(SearchCriteria.create({ size: 7.9 }).pagination.size).toBe(7);
  });

  it('starts at page one whatever the caller counts from', () => {
    expect(SearchCriteria.create({ page: 0 }).pagination.page).toBe(1);
    expect(SearchCriteria.create({ page: -3 }).pagination.page).toBe(1);
    expect(SearchCriteria.create({ page: 2.7 }).pagination.page).toBe(2);
  });

  it('defaults to a page a reader can take in', () => {
    const criteria = SearchCriteria.create({});

    expect(criteria.pagination).toEqual({ page: 1, size: DEFAULT_PAGE_SIZE });
    expect(criteria.sort).toBe('relevance');
    expect(criteria.keywords).toBeUndefined();
  });

  it('offsets by whole pages, so no result is shown twice or skipped', () => {
    expect(SearchCriteria.create({ page: 1, size: 20 }).from).toBe(0);
    expect(SearchCriteria.create({ page: 2, size: 20 }).from).toBe(20);
    expect(SearchCriteria.create({ page: 5, size: 25 }).from).toBe(100);
  });

  it('cannot be talked past the result window by a size the cap would have allowed through', () => {
    const criteria = SearchCriteria.create({ page: 100, size: 1_000 });

    expect(criteria.from + criteria.pagination.size).toBeLessThanOrEqual(MAX_RESULT_WINDOW);
  });
});

describe('filters that select nothing', () => {
  it('drops a terms filter with no values, which would otherwise match nobody', () => {
    const criteria = SearchCriteria.create({ filters: { skills: { type: 'terms', values: [] } } });

    expect(criteria.filters).toEqual([]);
  });

  it('drops a range and a date range with neither bound set', () => {
    const criteria = SearchCriteria.create({
      filters: {
        connections: { type: 'range' },
        jobStartYear: { type: 'date_range' },
      },
    });

    expect(criteria.filters).toEqual([]);
  });

  it('keeps "this field is absent", which selects a real and useful set of people', () => {
    const criteria = SearchCriteria.create({
      filters: { skills: { type: 'exists', present: false } },
    });

    expect(criteria.filters).toHaveLength(1);
    expect(criteria.filters[0].value).toEqual({ type: 'exists', present: false });
  });

  it('keeps a range with only one bound, which is how an open-ended search is written', () => {
    const criteria = SearchCriteria.create({
      filters: { connections: { type: 'range', min: 500 } },
    });

    expect(criteria.filters).toHaveLength(1);
    expect(criteria.filters[0].field.key).toBe('connections');
  });
});

describe('filters naming a field that does not exist', () => {
  it('refuses the request naming the key, rather than searching without it', () => {
    const attempt = () =>
      SearchCriteria.create({ filters: { favouriteColour: { type: 'terms', values: ['red'] } } });

    expect(attempt).toThrow(UnknownFilterFieldError);
    expect(attempt).toThrow(/favouriteColour/);
  });

  it('refuses a key that differs from a real field only in case, since the index is case sensitive', () => {
    expect(() =>
      SearchCriteria.create({ filters: { Skills: { type: 'terms', values: ['sql'] } } }),
    ).toThrow(UnknownFilterFieldError);
  });

  it('resolves a known key to the registry field, so the query builder needs no second lookup', () => {
    const criteria = SearchCriteria.create({
      filters: { skills: { type: 'terms', values: ['civil engineering'] } },
    });

    expect(criteria.filters[0].field.key).toBe('skills');
    expect(criteria.filters[0].field.esField).toBeTruthy();
  });
});

describe('keywords', () => {
  it('treats a blank search box as no keyword search rather than a search for nothing', () => {
    expect(SearchCriteria.create({ keywords: '   ' }).keywords).toBeUndefined();
    expect(SearchCriteria.create({ keywords: '' }).keywords).toBeUndefined();
  });

  it('trims the padding a copied search term arrives with', () => {
    expect(SearchCriteria.create({ keywords: '  civil engineering  ' }).keywords).toBe(
      'civil engineering',
    );
  });
});
