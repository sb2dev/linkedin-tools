import type { JSX } from 'react';
import clsx from 'clsx';
import type { ImportPreview, ImportRowStatus } from '@/types/api';
import { cardClass, focusRing } from '@/components/layout';
import { formatBytes, formatNumber } from '@/lib/format';
import { NO_FILTER, countsUnder, type RowFilter } from './preview-rows';

/** True when the filter selects exactly these statuses and nothing else narrows it further. */
function selects(filter: RowFilter, statuses: readonly ImportRowStatus[]): boolean {
  if (filter.scrambled || filter.duplicate) return false;
  if (filter.statuses.length !== statuses.length) return false;
  return statuses.every((status) => filter.statuses.includes(status));
}

export interface PreviewSummaryProps {
  preview: ImportPreview;
  /** The totals follow the repair policy in force, so the tiles and the table never disagree. */
  repair: boolean;
  filter: RowFilter;
  onFilterChange: (filter: RowFilter) => void;
}

export interface TileProps {
  label: string;
  value: number;
  emphasis?: 'accent' | 'warn';
  /** Makes the tile a filter control; a tile without one is a read-only number. */
  onSelect?: () => void;
  active?: boolean;
}

export function Tile({ label, value, emphasis, onSelect, active }: TileProps): JSX.Element {
  const body = (
    <>
      <p
        className={clsx(
          'text-xl font-semibold tabular-nums',
          emphasis === 'accent' && 'text-accent',
          emphasis === 'warn' && 'text-warning',
        )}
      >
        {formatNumber(value)}
      </p>
      <p className="text-xs text-muted">{label}</p>
    </>
  );

  if (onSelect === undefined) return <div className={clsx(cardClass, 'px-3 py-2')}>{body}</div>;

  return (
    <button
      type="button"
      aria-pressed={active === true}
      onClick={onSelect}
      className={clsx(
        cardClass,
        'px-3 py-2 text-left hover:border-accent',
        focusRing,
        active === true && 'border-accent ring-1 ring-accent',
      )}
    >
      {body}
    </button>
  );
}

/** Chip form of the same idea, for the counts that describe a flag rather than an outcome. */
function FlagChip({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={clsx(
        'rounded px-1 underline underline-offset-2',
        focusRing,
        pressed ? 'text-accent' : 'hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}

/** What the file holds and what committing it would change. Every tile filters the table below. */
export function PreviewSummary({
  preview,
  repair,
  filter,
  onFilterChange,
}: PreviewSummaryProps): JSX.Element {
  const counts = countsUnder(preview, repair);
  // A collapsed row was accepted: it parsed and named a real person, another row just got there first.
  const accepted: ImportRowStatus[] = ['new', 'updated', 'unchanged', 'duplicate'];

  // A tile promises the number it prints, so it drops the flags; the typed search is left alone.
  function select(statuses: ImportRowStatus[]): void {
    const base = { ...NO_FILTER, text: filter.text };
    onFilterChange(selects(filter, statuses) ? base : { ...base, statuses });
  }

  function toggleScrambled(): void {
    onFilterChange({ ...filter, scrambled: !filter.scrambled });
  }

  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        {preview.filename} · {formatBytes(preview.sizeBytes)} · analysed{' '}
        {new Date(preview.createdAt).toLocaleString()}
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile
          label="Rows in file"
          value={counts.rowsTotal}
          onSelect={() => {
            select([]);
          }}
          active={selects(filter, [])}
        />
        <Tile
          label="Rows accepted"
          value={counts.rowsAccepted}
          onSelect={() => {
            select(accepted);
          }}
          active={selects(filter, accepted)}
        />
        <Tile
          label="New profiles"
          value={counts.profilesNew}
          emphasis="accent"
          onSelect={() => {
            select(['new']);
          }}
          active={selects(filter, ['new'])}
        />
        <Tile
          label="Needs update"
          value={counts.profilesUpdated}
          emphasis="accent"
          onSelect={() => {
            select(['updated']);
          }}
          active={selects(filter, ['updated'])}
        />
        <Tile
          label="Unchanged"
          value={counts.profilesUnchanged}
          onSelect={() => {
            select(['unchanged']);
          }}
          active={selects(filter, ['unchanged'])}
        />
        <Tile
          label="Rows rejected"
          value={counts.rowsRejected}
          emphasis="warn"
          onSelect={() => {
            select(['rejected']);
          }}
          active={selects(filter, ['rejected'])}
        />
      </div>

      <p className="text-xs text-muted">
        <FlagChip
          label={`${formatNumber(counts.duplicatesCollapsed)} duplicate rows collapsed`}
          pressed={selects(filter, ['duplicate'])}
          onClick={() => {
            select(['duplicate']);
          }}
        />{' '}
        ·{' '}
        <FlagChip
          label={`${formatNumber(counts.scrambledRows)} rows with a scrambled column block`}
          pressed={filter.scrambled}
          onClick={toggleScrambled}
        />{' '}
        · {formatNumber(counts.fieldsQuarantined)} fields quarantined
      </p>
    </section>
  );
}
