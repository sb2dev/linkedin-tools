import { useCallback, useId, useMemo, type FormEvent, type ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { FilterBar } from '@/components/filters/FilterBar';
import { PageContainer, buttonClass, focusRing } from '@/components/layout';
import { EmptyState, ErrorState, Pagination, ResultList, ResultSkeleton, SortSelect } from '@/components/results';
import { useDebouncedTextField, useSearchResults, useSearchSchema } from '@/hooks/use-search';
import { formatNumber, pluralize } from '@/lib/format';
import { parseSearchQuery, schemaKindLookup, setFilter, toSearchParams, updateQuery } from '@/lib/query-state';
import type { FilterState, FilterValue, SearchQuery, SortKey } from '@/types/api';

export function SearchPage(): ReactElement {
  const [params, setParams] = useSearchParams();
  const searchInputId = useId();

  const schemaQuery = useSearchSchema();
  const schema = schemaQuery.data;

  // The URL is the search state; the schema only tells the codec how to read each filter.
  const query = useMemo(() => parseSearchQuery(params, schemaKindLookup(schema)), [params, schema]);

  const commit = useCallback(
    (next: SearchQuery, replace = false) => {
      setParams(toSearchParams(next), { replace });
    },
    [setParams],
  );

  // Typing replaces the history entry, so Back steps between searches rather than keystrokes.
  const [keywords, setKeywords] = useDebouncedTextField(query.q, (next: string) => {
    commit(updateQuery(query, { q: next }), true);
  });

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    commit(updateQuery(query, { q: keywords.trim() }));
  };

  const changeFilters = (filters: FilterState): void => {
    commit(updateQuery(query, { filters }));
  };

  const changeFilter = (key: string, value: FilterValue | undefined): void => {
    changeFilters(setFilter(query.filters, key, value));
  };

  // Asking for a facet is a display concern: it replaces the history entry and keeps the page.
  const requestFacet = useCallback(
    (key: string) => {
      if (query.facets.includes(key)) return;
      commit({ ...query, facets: [...query.facets, key] }, true);
    },
    [commit, query],
  );

  const results = useSearchResults(query);
  const data = results.data;
  const showing =
    data && data.items.length > 0
      ? { from: (data.page - 1) * data.size + 1, to: (data.page - 1) * data.size + data.items.length }
      : undefined;

  return (
    <PageContainer>
      <form role="search" onSubmit={submit}>
        <label htmlFor={searchInputId} className="block text-sm font-medium text-ink">
          Search profiles
        </label>
        <input
          id={searchInputId}
          type="search"
          value={keywords}
          onChange={(event) => {
            setKeywords(event.target.value);
          }}
          placeholder="Skills, job titles, companies, schools…"
          autoComplete="off"
          className={clsx(
            'mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2 text-base text-ink placeholder:text-faint',
            focusRing,
          )}
        />
      </form>

      {schema ? (
        <FilterBar
          className="mt-4"
          fields={schema.fields}
          groups={schema.groups}
          filters={query.filters}
          facets={data?.facets ?? []}
          onChange={changeFilter}
          onClearAll={() => {
            changeFilters({});
          }}
          onRequestFacet={requestFacet}
        />
      ) : schemaQuery.isError ? (
        <p className="mt-4 rounded-md border border-line bg-white px-3 py-2 text-sm text-muted">
          Filters are unavailable: the search schema could not be loaded. Keyword search still works.
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <p aria-live="polite" className="text-sm text-muted">
          {results.isPending
            ? 'Searching…'
            : data
              ? data.total === 0
                ? 'No matches'
                : `${showing ? `${formatNumber(showing.from)}–${formatNumber(showing.to)} of ` : ''}${formatNumber(data.total)} ${pluralize(data.total, 'profile')} · ${formatNumber(data.tookMs)} ms`
              : ''}
        </p>
        {schema ? (
          <SortSelect
            value={query.sort}
            options={schema.sorts}
            onChange={(sort: SortKey) => {
              commit(updateQuery(query, { sort }));
            }}
          />
        ) : null}
      </div>

      <div className="mt-4">
        {results.isPending ? (
          <ResultSkeleton />
        ) : results.isError ? (
          <ErrorState
            error={results.error}
            title="The search failed"
            onRetry={() => {
              void results.refetch();
            }}
          />
        ) : data && data.items.length > 0 ? (
          <>
            <ResultList items={data.items} stale={results.isPlaceholderData} />
            <Pagination
              page={data.page}
              size={data.size}
              total={data.total}
              onPageChange={(page: number) => {
                commit(updateQuery(query, { page }));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </>
        ) : data && data.total > 0 ? (
          // A page past the last one is reachable by hand: say so and offer the way back.
          <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center">
            <p className="text-base font-medium text-ink">Page {formatNumber(data.page)} is past the last result</p>
            <p className="mx-auto mt-2 max-w-prose text-sm text-muted">
              This search has {formatNumber(data.total)} {pluralize(data.total, 'profile')}.
            </p>
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                className={clsx(buttonClass, focusRing)}
                onClick={() => {
                  commit(updateQuery(query, { page: 1 }));
                }}
              >
                Back to the first page
              </button>
            </div>
          </div>
        ) : (
          <EmptyState
            query={query}
            schema={schema}
            onRemoveFilter={(key: string) => {
              changeFilter(key, undefined);
            }}
            onClearFilters={() => {
              changeFilters({});
            }}
            onClearKeywords={() => {
              commit(updateQuery(query, { q: '' }));
            }}
          />
        )}
      </div>
    </PageContainer>
  );
}
