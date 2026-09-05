import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import clsx from 'clsx';
import type { FilterValue, SearchField } from '@/types/api';
import { inputClass } from '@/components/layout';

interface RangeControlProps {
  field: SearchField;
  value: FilterValue | undefined;
  onChange: (value: FilterValue | undefined) => void;
}

function toNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function format(bound: number | undefined): string {
  return bound === undefined ? '' : String(bound);
}

function rangeBounds(value: FilterValue | undefined): { min?: number; max?: number } {
  return value?.type === 'range' ? { min: value.min, max: value.max } : {};
}

function rangeValue(min: number | undefined, max: number | undefined): FilterValue | undefined {
  if (min === undefined && max === undefined) return undefined;
  const next: FilterValue = { type: 'range' };
  if (min !== undefined) next.min = min;
  if (max !== undefined) next.max = max;
  return next;
}

/** Either bound may be left blank, which the API reads as an open-ended range. */
export function RangeControl({ field, value, onChange }: RangeControlProps): JSX.Element {
  const { min, max } = rangeBounds(value);
  const [text, setText] = useState(() => ({ min: format(min), max: format(max) }));

  // Half-typed decimals such as "0." parse to the committed bound, so the raw text is left alone.
  useEffect(() => {
    setText((current) =>
      toNumber(current.min) === min && toNumber(current.max) === max
        ? current
        : { min: format(min), max: format(max) },
    );
  }, [min, max]);

  function edit(side: 'min' | 'max', raw: string): void {
    const next = { ...text, [side]: raw };
    setText(next);
    onChange(rangeValue(toNumber(next.min), toNumber(next.max)));
  }

  const inverted = min !== undefined && max !== undefined && min > max;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className="flex-1 text-xs text-muted">
          From
          <input
            type="number"
            inputMode="decimal"
            value={text.min}
            onChange={(event) => edit('min', event.target.value)}
            placeholder="Any"
            aria-label={`Minimum ${field.label}`}
            className={clsx(inputClass, 'mt-0.5')}
          />
        </label>
        <span aria-hidden="true" className="mt-4 text-muted">
          &ndash;
        </span>
        <label className="flex-1 text-xs text-muted">
          To
          <input
            type="number"
            inputMode="decimal"
            value={text.max}
            onChange={(event) => edit('max', event.target.value)}
            placeholder="Any"
            aria-label={`Maximum ${field.label}`}
            className={clsx(inputClass, 'mt-0.5')}
          />
        </label>
      </div>
      {inverted && <p className="text-xs text-negative">The lower bound is above the upper bound.</p>}
    </div>
  );
}
