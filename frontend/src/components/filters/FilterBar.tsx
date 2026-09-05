import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import clsx from 'clsx';
import type { Facet, FilterState, FilterValue, SearchField } from '@/types/api';
import { focusRing } from '@/components/layout';
import { AddFilterButton } from './AddFilterButton';
import { ActiveFilterChips, describeFilter } from './ActiveFilterChips';
import { FilterPopover } from './FilterPopover';

interface FilterBarProps {
  /** The whole schema; every control is derived from it. */
  fields: SearchField[];
  groups: string[];
  filters: FilterState;
  /** Facets from the current search response, so counts reflect the filters already applied. */
  facets: Facet[];
  onChange: (key: string, value: FilterValue | undefined) => void;
  onClearAll: () => void;
  /** Asks the page to include a field in the next search's facets, so its counts can be shown. */
  onRequestFacet?: (key: string) => void;
  className?: string;
}

function PrimaryFilterTrigger({
  field,
  value,
  facet,
  open,
  onOpenChange,
  onChange,
}: {
  field: SearchField;
  value: FilterValue | undefined;
  facet?: Facet;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: FilterValue | undefined) => void;
}): JSX.Element {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = value !== undefined;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => onOpenChange(!open)}
        className={clsx(
          'flex max-w-64 items-center gap-1 rounded border px-2.5 py-1.5 text-sm',
          active ? 'border-accent bg-accent/5 text-accent' : 'border-line hover:border-accent',
          focusRing,
        )}
      >
        <span className="truncate">{active ? describeFilter(field, value) : field.label}</span>
        <span aria-hidden="true" className="text-xs opacity-60">
          ▾
        </span>
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
    </div>
  );
}

/** A short row of the most-used fields, the rest behind "Add filter". One popover open at a time. */
export function FilterBar({
  fields,
  groups,
  filters,
  facets,
  onChange,
  onClearAll,
  onRequestFacet,
  className,
}: FilterBarProps): JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null);
  const requested = useRef(new Set<string>());
  const facetMap = useMemo(() => new Map(facets.map((facet) => [facet.key, facet])), [facets]);
  const primary = useMemo(() => fields.filter((field) => field.primary === true), [fields]);

  const openFieldKey = openId === null ? null : openId.slice(openId.indexOf(':') + 1);

  // Facet buckets only arrive for fields the search asked about, so opening one asks for its counts.
  useEffect(() => {
    if (openFieldKey === null || openId === 'add') return;
    const field = fields.find((entry) => entry.key === openFieldKey);
    if (!field?.facetable || field.typeahead === true) return;
    if (facetMap.has(field.key) || requested.current.has(field.key)) return;
    requested.current.add(field.key);
    onRequestFacet?.(field.key);
  }, [openFieldKey, openId, fields, facetMap, onRequestFacet]);

  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {primary.map((field) => (
          <PrimaryFilterTrigger
            key={field.key}
            field={field}
            value={filters[field.key]}
            facet={facetMap.get(field.key)}
            open={openId === `primary:${field.key}`}
            onOpenChange={(open) => setOpenId(open ? `primary:${field.key}` : null)}
            onChange={(value) => onChange(field.key, value)}
          />
        ))}
        <AddFilterButton
          fields={fields}
          groups={groups}
          filters={filters}
          facets={facetMap}
          open={openId === 'add'}
          onOpenChange={(open) => setOpenId(open ? 'add' : null)}
          onChange={onChange}
        />
      </div>

      <ActiveFilterChips
        fields={fields}
        filters={filters}
        facets={facetMap}
        openId={openId}
        onOpenChange={setOpenId}
        onChange={onChange}
        onClearAll={onClearAll}
      />
    </div>
  );
}
