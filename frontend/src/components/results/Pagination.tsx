import type { ReactElement } from 'react';
import clsx from 'clsx';
import { formatNumber } from '@/lib/format';
import { buttonClass, focusRing } from '@/components/layout/ui';

/** Elasticsearch refuses to page beyond its default result window; the controls stop where it does. */
const MAX_RESULT_WINDOW = 10_000;

interface PaginationProps {
  page: number;
  size: number;
  total: number;
  onPageChange: (page: number) => void;
}

function pageWindow(page: number, lastPage: number, span = 1): number[] {
  const pages = new Set<number>([1, lastPage, page]);
  for (let offset = 1; offset <= span; offset += 1) {
    if (page - offset >= 1) pages.add(page - offset);
    if (page + offset <= lastPage) pages.add(page + offset);
  }
  return [...pages].sort((left, right) => left - right);
}

export function Pagination({ page, size, total, onPageChange }: PaginationProps): ReactElement | null {
  const lastPage = Math.max(1, Math.min(Math.ceil(total / size), Math.floor(MAX_RESULT_WINDOW / size)));
  if (lastPage <= 1) return null;

  // A page number out of range is reachable by hand; the controls stay on pages that exist.
  const current = Math.min(Math.max(page, 1), lastPage);
  const pages = pageWindow(current, lastPage);

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <button
        type="button"
        className={clsx(buttonClass, focusRing)}
        onClick={() => {
          onPageChange(current - 1);
        }}
        disabled={current <= 1}
      >
        Previous
      </button>

      <p className="text-sm text-muted sm:hidden">
        Page {formatNumber(current)} of {formatNumber(lastPage)}
      </p>

      <ol className="hidden items-center gap-1 sm:flex">
        {pages.map((entry, index) => (
          <li key={entry} className="flex items-center gap-1">
            {index > 0 && entry - pages[index - 1] > 1 ? (
              <span className="px-1 text-muted" aria-hidden="true">
                …
              </span>
            ) : null}
            <button
              type="button"
              aria-current={entry === current ? 'page' : undefined}
              onClick={() => {
                onPageChange(entry);
              }}
              className={clsx(
                'min-w-9 rounded-md border px-2 py-1.5 text-sm',
                focusRing,
                entry === current
                  ? 'border-accent bg-accent/10 font-medium text-accent'
                  : 'border-line bg-white text-muted hover:text-ink',
              )}
            >
              {formatNumber(entry)}
            </button>
          </li>
        ))}
      </ol>

      <button
        type="button"
        className={clsx(buttonClass, focusRing)}
        onClick={() => {
          onPageChange(current + 1);
        }}
        disabled={current >= lastPage}
      >
        Next
      </button>
    </nav>
  );
}
