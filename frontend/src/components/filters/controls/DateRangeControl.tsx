import type { JSX } from 'react';
import clsx from 'clsx';
import type { FilterValue, SearchField } from '@/types/api';
import { inputClass } from '@/components/layout';

interface DateRangeControlProps {
  field: SearchField;
  value: FilterValue | undefined;
  onChange: (value: FilterValue | undefined) => void;
}

/** The dataset stores yyyy, yyyy-MM or yyyy-MM-dd, so a bound is accepted at any of those widths. */
const PARTIAL_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

function dateBounds(value: FilterValue | undefined): { from?: string; to?: string } {
  return value?.type === 'date_range' ? { from: value.from, to: value.to } : {};
}

function dateRangeValue(from: string, to: string): FilterValue | undefined {
  const start = from.trim();
  const end = to.trim();
  if (start.length === 0 && end.length === 0) return undefined;
  const next: FilterValue = { type: 'date_range' };
  if (start.length > 0) next.from = start;
  if (end.length > 0) next.to = end;
  return next;
}

export function DateRangeControl({ field, value, onChange }: DateRangeControlProps): JSX.Element {
  const { from = '', to = '' } = dateBounds(value);
  const malformed = [from, to].some((bound) => bound.length > 0 && !PARTIAL_DATE.test(bound));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className="flex-1 text-xs text-muted">
          From year
          <input
            type="text"
            inputMode="numeric"
            maxLength={10}
            value={from}
            onChange={(event) => onChange(dateRangeValue(event.target.value, to))}
            placeholder="Any"
            aria-label={`Earliest ${field.label}`}
            className={clsx(inputClass, 'mt-0.5')}
          />
        </label>
        <span aria-hidden="true" className="mt-4 text-muted">
          &ndash;
        </span>
        <label className="flex-1 text-xs text-muted">
          To year
          <input
            type="text"
            inputMode="numeric"
            maxLength={10}
            value={to}
            onChange={(event) => onChange(dateRangeValue(from, event.target.value))}
            placeholder="Any"
            aria-label={`Latest ${field.label}`}
            className={clsx(inputClass, 'mt-0.5')}
          />
        </label>
      </div>
      {malformed && <p className="text-xs text-negative">Use a year, or yyyy-MM / yyyy-MM-dd.</p>}
    </div>
  );
}
