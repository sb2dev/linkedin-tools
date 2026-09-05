import type { ReactElement } from 'react';
import clsx from 'clsx';
import { formatFilterValue } from '@/lib/format';
import { buttonClass, cardClass, focusRing } from '@/components/layout';
import { ApiError, type FilterState, type FilterValue, type SearchQuery, type SearchSchema } from '@/types/api';

interface EmptyStateProps {
  query: SearchQuery;
  schema?: SearchSchema;
  onRemoveFilter: (key: string) => void;
  onClearFilters: () => void;
  onClearKeywords: () => void;
}

/** A single required term narrows harder than a wide list or an open-ended range. */
function restrictiveness(value: FilterValue): number {
  switch (value.type) {
    case 'terms':
      return 2 + 1 / value.values.length;
    case 'range':
      return value.min !== undefined && value.max !== undefined ? 2.5 : 1.5;
    case 'date_range':
      return value.from !== undefined && value.to !== undefined ? 2.5 : 1.5;
    case 'exists':
      return 1;
  }
}

function mostRestrictive(filters: FilterState): string | undefined {
  let best: string | undefined;
  let bestScore = -Infinity;
  for (const [key, value] of Object.entries(filters)) {
    const score = restrictiveness(value);
    if (score > bestScore) {
      best = key;
      bestScore = score;
    }
  }
  return best;
}

export function EmptyState({
  query,
  schema,
  onRemoveFilter,
  onClearFilters,
  onClearKeywords,
}: EmptyStateProps): ReactElement {
  const filterKeys = Object.keys(query.filters);
  const narrowest = mostRestrictive(query.filters);
  const narrowestField = narrowest ? schema?.fields.find((field) => field.key === narrowest) : undefined;
  const narrowestLabel = narrowestField?.label ?? narrowest;

  return (
    <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center">
      <p className="text-base font-medium text-ink">No profiles match this search</p>

      {narrowest ? (
        <>
          <p className="mx-auto mt-2 max-w-prose text-sm text-muted">
            {filterKeys.length === 1 ? 'The active filter' : `${String(filterKeys.length)} filters are active, and`}{' '}
            <span className="font-medium text-ink">{narrowestLabel}</span> is the narrowest, so it is the first thing
            worth dropping.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className={clsx(buttonClass, focusRing)}
              onClick={() => {
                onRemoveFilter(narrowest);
              }}
            >
              Remove {narrowestLabel}: {formatFilterValue(query.filters[narrowest])}
            </button>
            {filterKeys.length > 1 ? (
              <button type="button" className={clsx(buttonClass, focusRing)} onClick={onClearFilters}>
                Clear all filters
              </button>
            ) : null}
          </div>
        </>
      ) : query.q.length > 0 ? (
        <>
          <p className="mx-auto mt-2 max-w-prose text-sm text-muted">
            Nothing matched <span className="font-medium text-ink">{query.q}</span>. Try fewer or more general words. The
            dataset is lowercase free text, so a shorter stem usually matches more.
          </p>
          <div className="mt-4 flex justify-center">
            <button type="button" className={clsx(buttonClass, focusRing)} onClick={onClearKeywords}>
              Clear keywords
            </button>
          </div>
        </>
      ) : (
        <p className="mx-auto mt-2 max-w-prose text-sm text-muted">
          The index has no profiles yet. Upload the dataset from the Import page to populate it.
        </p>
      )}
    </div>
  );
}

interface ErrorStateProps {
  error: Error;
  onRetry?: () => void;
  /** Overrides the generic heading where the failing operation is worth naming. */
  title?: string;
}

export function ErrorState({ error, onRetry, title }: ErrorStateProps): ReactElement {
  const problem = error instanceof ApiError ? error : undefined;
  const heading = title ?? problem?.title ?? 'Something went wrong';
  const detail = problem?.problem.detail ?? error.message;
  const fieldErrors = Object.entries(problem?.fieldErrors ?? {});

  return (
    <div role="alert" className={clsx(cardClass, 'p-6')}>
      <p className="text-base font-medium text-ink">{heading}</p>
      {detail.length > 0 ? <p className="mt-1 max-w-prose text-sm text-muted">{detail}</p> : null}

      {fieldErrors.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-muted">
          {fieldErrors.map(([field, messages]) => (
            <li key={field}>
              <span className="font-medium text-ink">{field}</span>: {messages.join(', ')}
            </li>
          ))}
        </ul>
      ) : null}

      {problem?.isOffline ? (
        <p className="mt-3 text-sm text-muted">
          Start the API on port 3100, then retry. Nothing was lost: the search lives in the URL.
        </p>
      ) : null}

      {onRetry ? (
        <button type="button" className={clsx(buttonClass, focusRing, 'mt-4')} onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
