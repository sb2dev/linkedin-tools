import { useId, useState } from 'react';
import type { JSX } from 'react';
import clsx from 'clsx';
import type { ImportPreview, RealignmentSample } from '@/types/api';
import { cardClass, focusRing } from '@/components/layout';
import { formatNumber, pluralize } from '@/lib/format';

export interface RepairToggleProps {
  preview: ImportPreview;
  repair: boolean;
  onRepairChange: (repair: boolean) => void;
}

/** A signed count, so "+34 new profiles" and "-412 quarantined fields" both read as a direction. */
function Delta({ label, from, to }: { label: string; from: number; to: number }): JSX.Element | null {
  const change = to - from;
  if (change === 0) return null;

  return (
    <li>
      <span className="font-medium tabular-nums text-ink">
        {change > 0 ? '+' : '−'}
        {formatNumber(Math.abs(change))}
      </span>{' '}
      {label}
    </li>
  );
}

/** One row the realignment moves, with the columns it moves them between. */
function Evidence({ sample }: { sample: RealignmentSample }): JSX.Element {
  const columns = Object.keys(sample.after).filter((column) => sample.before[column] !== sample.after[column]);

  return (
    <div className="border-t border-line py-2 first:border-t-0">
      <p className="text-xs font-medium text-ink">
        {sample.fullName}{' '}
        <span className="font-normal text-muted">
          · block shifted by {sample.offset > 0 ? `+${String(sample.offset)}` : String(sample.offset)}
        </span>
      </p>
      <dl className="mt-1 space-y-1">
        {columns.map((column) => (
          <div key={column} className="grid grid-cols-[6rem_1fr] gap-2 text-[11px]">
            <dt className="truncate font-mono text-muted">{column}</dt>
            <dd className="min-w-0">
              <p className="truncate text-muted line-through">{sample.before[column] || '(empty)'}</p>
              <p className="truncate text-ink">{sample.after[column] || '(empty)'}</p>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Realignment is the reader's call, never automatic: it rewrites cells the file put in the wrong
 * column, and the preview has to price that choice before anything is written. A file with no
 * scrambled block has nothing to decide, so the panel stays out of the way.
 */
export function RepairToggle({ preview, repair, onRepairChange }: RepairToggleProps): JSX.Element | null {
  const id = useId();
  const [showEvidence, setShowEvidence] = useState(false);

  const plain = preview.counts;
  const repaired = preview.countsWithRepair;
  if (plain.scrambledRows === 0 && repaired.realignedRows === 0) return null;

  const movable = repaired.realignedRows;

  return (
    <section className={clsx(cardClass, 'flex flex-col gap-2 p-3')}>
      <div className="flex items-start gap-2">
        <input
          id={id}
          type="checkbox"
          checked={repair}
          disabled={movable === 0}
          onChange={(event) => {
            onRepairChange(event.target.checked);
          }}
          className={clsx('mt-0.5 size-4 accent-accent disabled:opacity-40', focusRing)}
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="text-sm font-medium">
            Realign {formatNumber(movable)} scrambled {pluralize(movable, 'row')}
          </label>
          <p className="text-xs text-muted">
            {formatNumber(plain.scrambledRows)} {pluralize(plain.scrambledRows, 'row')} in this file
            have their multi-value columns shifted out of place.{' '}
            {movable === 0
              ? 'None of them has a shift that can be proved, so there is nothing to move.'
              : `A single offset explains ${formatNumber(movable)} of them, and only those are moved. The rest stay quarantined.`}
          </p>
        </div>
      </div>

      {movable > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-0.5 pl-6 text-xs text-muted">
          <Delta label="new profiles" from={plain.profilesNew} to={repaired.profilesNew} />
          <Delta label="profiles needing an update" from={plain.profilesUpdated} to={repaired.profilesUpdated} />
          <Delta label="rows still scrambled" from={plain.scrambledRows} to={repaired.scrambledRows} />
          <Delta label="quarantined fields" from={plain.fieldsQuarantined} to={repaired.fieldsQuarantined} />
        </ul>
      )}

      {preview.repairSample.length > 0 && (
        <div className="pl-6">
          <button
            type="button"
            aria-expanded={showEvidence}
            onClick={() => {
              setShowEvidence((open) => !open);
            }}
            className={clsx('rounded text-xs text-accent underline-offset-2 hover:underline', focusRing)}
          >
            {showEvidence ? 'Hide' : 'Show'} what would move
          </button>
          {showEvidence && (
            <div className="mt-2 rounded border border-line bg-surface px-2">
              {preview.repairSample.map((sample) => (
                <Evidence key={sample.linkedinUsername} sample={sample} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
