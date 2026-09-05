import { useMemo } from 'react';
import type { JSX } from 'react';
import clsx from 'clsx';
import type { Facet, FilterValue, SearchField } from '@/types/api';
import { mergeOptions, selectedTerms, termsValue, toggleTerm } from './TermsControl';

interface OrderedTermsControlProps {
  field: SearchField;
  value: FilterValue | undefined;
  facet?: Facet;
  onChange: (value: FilterValue | undefined) => void;
}

/** Salary bands and company sizes are ordered strings, not numbers, so they are picked as chips. */
export function OrderedTermsControl({ field, value, facet, onChange }: OrderedTermsControlProps): JSX.Element {
  const selected = selectedTerms(value);

  const options = useMemo(() => {
    if (field.options && field.options.length > 0) {
      const counts = new Map((facet?.buckets ?? []).map((bucket) => [bucket.value, bucket.count]));
      const declared = field.options.map((option) => ({ value: option, count: counts.get(option) }));
      const extra = selected
        .filter((entry) => !field.options?.includes(entry))
        .map((entry) => ({ value: entry, count: counts.get(entry) }));
      return [...declared, ...extra];
    }
    return mergeOptions(facet, undefined, selected);
  }, [field.options, facet, selected]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={checked}
              onClick={() => onChange(termsValue(toggleTerm(selected, option.value)))}
              className={clsx(
                'rounded-full border px-2.5 py-1 text-xs',
                checked ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent',
                !checked && option.count === 0 && 'text-muted',
              )}
            >
              {option.value}
              {option.count !== undefined && (
                <span className={clsx('ml-1 tabular-nums', checked ? 'text-white/80' : 'text-muted')}>
                  {option.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {options.length === 0 && <p className="text-xs text-muted">No values available.</p>}
    </div>
  );
}
