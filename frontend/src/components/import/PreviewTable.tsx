import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import clsx from 'clsx';
import type { ImportRowReport, ImportRowStatus } from '@/types/api';
import { cardClass, focusRing } from '@/components/layout';
import { Pagination } from '@/components/results';
import { formatNumber, formatQualityScore, pluralize } from '@/lib/format';
import { PreviewFilters } from './PreviewFilters';
import { SourceDialog } from './SourceDialog';
import { countFilters } from './row-facets';
import { useRowSource } from './use-row-source';
import {
  DEFAULT_SORT,
  NO_FILTER,
  filterRows,
  isFiltered,
  nextSort,
  resolveRows,
  sortRows,
  statusLabel,
  type PreviewRow,
  type RowFilter,
  type RowSort,
  type RowSortKey,
} from './preview-rows';

/** One screenful at a time. The filter and the sort still run over every row in the file. */
const PAGE_SIZE = 50;

const headingId = 'preview-rows-heading';

export interface PreviewTableProps {
  /** The preview these rows belong to; the source dialog fetches its lines from it. */
  importId: string;
  rows: ImportRowReport[];
  /** Rows are read under the repair policy in force, so a realigned row shows its repaired verdict. */
  repair: boolean;
  /** Rows the API counted but did not list, so the table can say what it is not showing. */
  rowsOmitted: number;
  filter: RowFilter;
  onFilterChange: (filter: RowFilter) => void;
}

const STATUS_STYLES: Record<ImportRowStatus, string> = {
  new: 'border-positive/40 bg-positive/10 text-positive',
  updated: 'border-sky-300 bg-sky-50 text-sky-800',
  unchanged: 'border-line bg-surface text-muted',
  duplicate: 'border-violet-300 bg-violet-50 text-violet-800',
  rejected: 'border-warning/40 bg-warning/10 text-warning',
};

const NEUTRAL_CHIP = 'border-line bg-surface text-muted';

/** One tone per refusal, so the reasons are told apart down the column. */
const REASON_STYLES: Record<string, string> = {
  JUNK_LINE: NEUTRAL_CHIP,
  FIELD_COUNT_MISMATCH: 'border-warning/40 bg-warning/10 text-warning',
  EMBEDDED_HEADER: 'border-sky-300 bg-sky-50 text-sky-800',
};

function Chip({ label, tone }: { label: string; tone: string }): JSX.Element {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium',
        tone,
      )}
    >
      {label}
    </span>
  );
}

/** Says what the row does to the corpus first, then why it is unusual. */
function StatusCell({ row }: { row: PreviewRow }): JSX.Element {

  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Chip label={statusLabel(row.status)} tone={STATUS_STYLES[row.status]} />
      {/* The name of a refused line is its rejection label, which is what the chip has to say. */}
      {row.rejectionReason !== undefined && (
        <Chip label={row.name} tone={REASON_STYLES[row.rejectionReason] ?? NEUTRAL_CHIP} />
      )}
      {row.duplicateOfLine !== undefined && (
        <Chip label={`Same person as line ${formatNumber(row.duplicateOfLine)}`} tone={NEUTRAL_CHIP} />
      )}
      {row.duplicatesCollapsed > 0 && (
        <Chip
          label={`+${formatNumber(row.duplicatesCollapsed)} duplicate ${pluralize(row.duplicatesCollapsed, 'row')}`}
          tone={NEUTRAL_CHIP}
        />
      )}
      {row.realigned && (
        <Chip
          label={row.offset === undefined ? 'Realigned' : `Realigned by ${row.offset}`}
          tone="border-positive/40 bg-positive/10 text-positive"
        />
      )}
      {row.scrambled && (
        <Chip label="Scrambled" tone="border-warning/40 bg-warning/10 text-warning" />
      )}
    </div>
  );
}

function PersonCell({ row }: { row: PreviewRow }): JSX.Element {
  if (row.status === 'rejected') {
    return (
      <div className="min-w-0">
        <span className="block truncate font-medium">{row.name}</span>
        {row.excerpt !== undefined && (
          <code className="block truncate font-mono text-xs text-muted">{row.excerpt}</code>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <span className="block truncate font-medium">{row.name}</span>
      {row.role.length > 0 && (
        <span className="block truncate text-xs text-muted md:hidden">{row.role}</span>
      )}
      {row.location.length > 0 && (
        <span className="block truncate text-xs text-muted lg:hidden">{row.location}</span>
      )}
    </div>
  );
}

function SortHeader({
  label,
  column,
  sort,
  onSort,
  className,
}: {
  label: string;
  column: RowSortKey;
  sort: RowSort;
  onSort: (column: RowSortKey) => void;
  className?: string;
}): JSX.Element {
  const active = sort.key === column;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={clsx('px-2 py-1.5 font-medium', className)}
    >
      <button
        type="button"
        onClick={() => {
          onSort(column);
        }}
        className={clsx('rounded hover:text-ink', focusRing, active && 'text-ink')}
      >
        {label}
        <span aria-hidden="true" className="ml-1 text-[10px]">
          {active ? (sort.direction === 'asc' ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  );
}

function Notice({ title, children }: { title: string; children?: JSX.Element }): JSX.Element {
  return (
    <div className={clsx(cardClass, 'border-dashed p-6 text-center')}>
      <p className="text-sm font-medium text-ink">{title}</p>
      {children}
    </div>
  );
}

/** Every line of the uploaded file, searchable and sortable. */
export function PreviewTable({
  importId,
  rows,
  rowsOmitted,
  repair,
  filter,
  onFilterChange,
}: PreviewTableProps): JSX.Element {
  const [sort, setSort] = useState<RowSort>(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const source = useRowSource(importId);

  const resolved = useMemo(() => resolveRows(rows, repair), [rows, repair]);
  const matching = useMemo(() => filterRows(resolved, filter), [resolved, filter]);
  const ordered = useMemo(() => sortRows(matching, sort), [matching, sort]);
  const counts = useMemo(() => countFilters(resolved, filter), [resolved, filter]);
  // The dialog outlives a filter change, so the row it names is looked up in the whole file.
  const opened = resolved.find((row) => row.lineNumber === source.lineNumber);

  if (rows.length === 0) {
    return (
      <Notice title="This preview carries no rows">
        <p className="mt-1 text-xs text-muted">The file held no data lines the reader could place.</p>
      </Notice>
    );
  }

  // A page number is only valid against the current filter, so it is clamped rather than reset.
  const lastPage = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const current = Math.min(Math.max(page, 1), lastPage);
  const start = (current - 1) * PAGE_SIZE;
  const visible = ordered.slice(start, start + PAGE_SIZE);

  function onSort(column: RowSortKey): void {
    setSort(nextSort(sort, column));
    setPage(1);
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-sm font-medium">
        Every row in the file
      </h3>

      <PreviewFilters
        filter={filter}
        onChange={(next) => {
          onFilterChange(next);
          setPage(1);
        }}
        counts={counts}
        shown={ordered.length}
        total={resolved.length}
      />

      {ordered.length === 0 ? (
        <Notice title="No row matches these filters">
          <button
            type="button"
            onClick={() => {
              onFilterChange(NO_FILTER);
            }}
            className={clsx('mt-2 rounded text-xs text-accent underline underline-offset-2', focusRing)}
          >
            Clear filters
          </button>
        </Notice>
      ) : (
        <>
          <div className={clsx(cardClass, 'overflow-hidden')}>
            <table className="w-full table-fixed text-left text-sm">
              <caption className="px-2 pt-2 text-left text-xs text-muted">
                Rows {formatNumber(start + 1)} to {formatNumber(start + visible.length)} of{' '}
                {formatNumber(ordered.length)}
                {isFiltered(filter) ? ' matching' : ''}
              </caption>
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <SortHeader label="Line" column="line" sort={sort} onSort={onSort} className="w-14" />
                  <SortHeader label="Name" column="name" sort={sort} onSort={onSort} />
                  <th scope="col" className="hidden px-2 py-1.5 font-medium md:table-cell">
                    Title at company
                  </th>
                  <th scope="col" className="hidden px-2 py-1.5 font-medium lg:table-cell">
                    Location
                  </th>
                  <th scope="col" className="hidden w-16 px-2 py-1.5 text-right font-medium sm:table-cell">
                    Skills
                  </th>
                  <SortHeader
                    label="Quality"
                    column="quality"
                    sort={sort}
                    onSort={onSort}
                    className="hidden w-20 sm:table-cell"
                  />
                  <th scope="col" className="w-28 px-2 py-1.5 text-right font-medium sm:w-44">
                    Status
                  </th>
                  <th scope="col" className="w-20 px-2 py-1.5 text-right font-medium">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((row) => (
                  <tr key={row.lineNumber} className="align-top">
                    <td className="px-2 py-1.5 tabular-nums text-muted">{row.lineNumber}</td>
                    <td className="px-2 py-1.5">
                      <PersonCell row={row} />
                    </td>
                    <td className="hidden truncate px-2 py-1.5 text-muted md:table-cell">{row.role}</td>
                    <td className="hidden truncate px-2 py-1.5 text-muted lg:table-cell">{row.location}</td>
                    <td className="hidden px-2 py-1.5 text-right tabular-nums text-muted sm:table-cell">
                      {row.status === 'rejected' ? '' : formatNumber(row.skills)}
                    </td>
                    <td className="hidden px-2 py-1.5 text-right tabular-nums text-muted sm:table-cell">
                      {row.status === 'rejected' ? '' : formatQualityScore(row.quality)}
                    </td>
                    <td className="px-2 py-1.5">
                      <StatusCell row={row} />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        aria-label={`Show the source of line ${String(row.lineNumber)}`}
                        onClick={() => {
                          source.open(row.lineNumber);
                        }}
                        className={clsx(
                          'rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-muted',
                          'hover:border-accent hover:text-accent',
                          focusRing,
                        )}
                      >
                        Source
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={current} size={PAGE_SIZE} total={ordered.length} onPageChange={setPage} />
        </>
      )}

      {opened !== undefined && (
        <SourceDialog
          row={opened}
          state={source.state}
          onClose={source.close}
          onRetry={source.retry}
        />
      )}

      {rowsOmitted > 0 && (
        <p className="text-xs text-muted">
          {formatNumber(rowsOmitted)} further {pluralize(rowsOmitted, 'row')} are counted above but too
          many to list individually.
        </p>
      )}
    </section>
  );
}
