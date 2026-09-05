import { useRef } from 'react';
import type { JSX } from 'react';
import type { Facet, FilterState, FilterValue, SearchField } from '@/types/api';
import { formatFilterValue } from '@/lib/format';
import { FilterPopover } from './FilterPopover';

const MAX_LISTED_TERMS = 3;

/** The sentence shown on a chip, for example "Skills: Python, Java +2". */
export function describeFilter(field: SearchField, value: FilterValue): string {
  // 'present'/'absent' reads badly after a label like "Has GitHub", so exists gets its own wording.
  if (value.type === 'exists') return `${field.label}: ${value.present ? 'yes' : 'no'}`;
  if (value.type !== 'terms') return `${field.label}: ${formatFilterValue(value)}`;
  const shown = value.values.slice(0, MAX_LISTED_TERMS);
  const rest = value.values.length - shown.length;
  const listed = formatFilterValue({ type: 'terms', values: shown });
  return `${field.label}: ${rest > 0 ? `${listed} +${rest}` : listed}`;
}

interface ActiveFilterChipsProps {
  fields: SearchField[];
  filters: FilterState;
  facets: Map<string, Facet>;
  /** Identifier of the popover the bar currently has open; chips use `chip:<field key>`. */
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  onChange: (key: string, value: FilterValue | undefined) => void;
  onClearAll: () => void;
}

function Chip({
  field,
  value,
  facet,
  open,
  onOpenChange,
  onChange,
}: {
  field: SearchField;
  value: FilterValue;
  facet?: Facet;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: FilterValue | undefined) => void;
}): JSX.Element {
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <span className="relative inline-flex items-center rounded-full border border-accent/40 bg-accent/5 text-xs">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => onOpenChange(!open)}
        className="max-w-72 truncate rounded-l-full py-1 pr-1 pl-2.5 text-accent hover:bg-accent/10"
      >
        {describeFilter(field, value)}
      </button>
      <button
        type="button"
        onClick={() => onChange(undefined)}
        aria-label={`Remove ${field.label} filter`}
        className="rounded-r-full py-1 pr-2 pl-1 text-accent/70 hover:bg-accent/10 hover:text-accent"
      >
        <span aria-hidden="true">&times;</span>
      </button>
      {open && (
        <FilterPopover
          key={field.key}
          field={field}
          value={value}
          facet={facet}
          anchorRef={triggerRef}
          onApply={onChange}
          onClose={() => onOpenChange(false)}
        />
      )}
    </span>
  );
}

/** One removable chip per active filter, plus a clear-all once more than one is set. */
export function ActiveFilterChips({
  fields,
  filters,
  facets,
  openId,
  onOpenChange,
  onChange,
  onClearAll,
}: ActiveFilterChipsProps): JSX.Element | null {
  const active = fields.filter((field) => filters[field.key] !== undefined);
  if (active.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {active.map((field) => (
        <Chip
          key={field.key}
          field={field}
          value={filters[field.key]}
          facet={facets.get(field.key)}
          open={openId === `chip:${field.key}`}
          onOpenChange={(open) => onOpenChange(open ? `chip:${field.key}` : null)}
          onChange={(value) => onChange(field.key, value)}
        />
      ))}
      {active.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="rounded px-2 py-1 text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
