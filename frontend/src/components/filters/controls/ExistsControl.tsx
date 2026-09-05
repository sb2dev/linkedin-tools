import { useId } from 'react';
import type { JSX } from 'react';
import clsx from 'clsx';
import type { FilterValue, SearchField } from '@/types/api';

interface ExistsControlProps {
  field: SearchField;
  value: FilterValue | undefined;
  onChange: (value: FilterValue | undefined) => void;
}

type Choice = 'any' | 'yes' | 'no';

const CHOICES: readonly { id: Choice; label: string }[] = [
  { id: 'any', label: 'Any' },
  { id: 'yes', label: 'Has it' },
  { id: 'no', label: 'Does not have it' },
];

function existsChoice(value: FilterValue | undefined): Choice {
  if (value?.type !== 'exists') return 'any';
  return value.present ? 'yes' : 'no';
}

export function ExistsControl({ field, value, onChange }: ExistsControlProps): JSX.Element {
  const current = existsChoice(value);
  const name = useId();

  return (
    <fieldset className="flex flex-col gap-1">
      {/* The popover already shows the label above the control, so the legend is for readers only. */}
      <legend className="sr-only">{field.label}</legend>
      {CHOICES.map((choice) => (
        <label
          key={choice.id}
          className={clsx(
            'flex items-center gap-2 rounded px-2 py-1.5 text-sm',
            current === choice.id ? 'bg-accent/10 text-accent' : 'hover:bg-line/60',
          )}
        >
          <input
            type="radio"
            name={name}
            value={choice.id}
            checked={current === choice.id}
            onChange={() =>
              onChange(choice.id === 'any' ? undefined : { type: 'exists', present: choice.id === 'yes' })
            }
            className="size-3.5 shrink-0 accent-accent"
          />
          {choice.label}
        </label>
      ))}
    </fieldset>
  );
}
