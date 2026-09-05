import { useId, type ReactElement } from 'react';
import clsx from 'clsx';
import { focusRing } from '@/components/layout/ui';
import type { SortKey, SortOption } from '@/types/api';

interface SortSelectProps {
  value: SortKey;
  /** The schema's catalogue: the client holds no sort vocabulary of its own. */
  options: SortOption[];
  onChange: (sort: SortKey) => void;
}

export function SortSelect({ value, options, onChange }: SortSelectProps): ReactElement {
  const id = useId();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-muted">
        Sort
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value as SortKey);
        }}
        className={clsx('rounded-md border border-line bg-white px-2 py-1.5 text-sm text-ink', focusRing)}
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
