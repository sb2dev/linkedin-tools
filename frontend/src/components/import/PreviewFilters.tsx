import type { JSX } from 'react';
import clsx from 'clsx';
import type { ImportRowStatus } from '@/types/api';
import { focusRing } from '@/components/layout';
import { formatNumber, pluralize } from '@/lib/format';
import type { FilterCounts } from './row-facets';
import { NO_FILTER, STATUSES, isFiltered, statusLabel, toggleStatus, type RowFilter } from './preview-rows';

export interface PreviewFiltersProps {
  filter: RowFilter;
  onChange: (filter: RowFilter) => void;
  /** How many rows each chip would select; see row-facets.ts for what they are counted against. */
  counts: FilterCounts;
  /** Rows the filter keeps, and rows in the file, for the count the screen reader hears. */
  shown: number;
  total: number;
}

function Toggle({
  label,
  count,
  pressed,
  onClick,
}: {
  label: string;
  count: number;
  pressed: boolean;
  onClick: () => void;
}): JSX.Element {
  // A chip that would select nothing is not worth pressing.
  const unavailable = count === 0 && !pressed;

  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={unavailable}
      onClick={onClick}
      className={clsx(
        'rounded-full border px-2.5 py-1 text-xs font-medium',
        focusRing,
        pressed && 'border-accent bg-accent/10 text-accent',
        !pressed && unavailable && 'cursor-not-allowed border-line bg-surface text-muted opacity-50',
        !pressed && !unavailable && 'border-line bg-white text-muted hover:text-ink',
      )}
    >
      {label} <span className="tabular-nums">{formatNumber(count)}</span>
    </button>
  );
}

/** Search plus four filters over the whole row set. */
export function PreviewFilters({
  filter,
  onChange,
  counts,
  shown,
  total,
}: PreviewFiltersProps): JSX.Element {
  const active = isFiltered(filter);

  function setFlag(key: 'scrambled' | 'duplicate'): void {
    onChange({ ...filter, [key]: !filter[key] });
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="block text-xs text-muted">
        Search rows
        <input
          type="search"
          value={filter.text}
          onChange={(event) => {
            onChange({ ...filter, text: event.target.value });
          }}
          placeholder="name, company, location, skill, reason or line number"
          className={clsx(
            'mt-0.5 w-full rounded border border-line bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-accent',
            focusRing,
          )}
        />
      </label>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted">Outcome</span>
        {STATUSES.map((status: ImportRowStatus) => (
          <Toggle
            key={status}
            label={statusLabel(status)}
            count={counts.statuses[status]}
            pressed={filter.statuses.includes(status)}
            onClick={() => {
              onChange(toggleStatus(filter, status));
            }}
          />
        ))}

        <span className="ml-2 text-xs text-muted">Only</span>
        <Toggle
          label="Scrambled"
          count={counts.scrambled}
          pressed={filter.scrambled}
          onClick={() => {
            setFlag('scrambled');
          }}
        />
        <Toggle
          label="In a duplicate pair"
          count={counts.duplicate}
          pressed={filter.duplicate}
          onClick={() => {
            setFlag('duplicate');
          }}
        />

        {active && (
          <button
            type="button"
            onClick={() => {
              onChange(NO_FILTER);
            }}
            className={clsx('rounded px-2 py-1 text-xs text-muted underline underline-offset-2 hover:text-ink', focusRing)}
          >
            Clear filters
          </button>
        )}
      </div>

      <p role="status" aria-live="polite" className="text-xs text-muted">
        Showing {formatNumber(shown)} of {formatNumber(total)} {pluralize(total, 'row')}
        {active ? ' after filtering' : ''}
      </p>
    </div>
  );
}
