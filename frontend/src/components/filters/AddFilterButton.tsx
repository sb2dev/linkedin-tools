import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react';
import clsx from 'clsx';
import type { Facet, FilterState, FilterValue, SearchField } from '@/types/api';
import { focusRing } from '@/components/layout';
import { FilterPopover } from './FilterPopover';
import { nextIndex, useDismissOnOutsidePointer, useOptionScroll } from './list-nav';
import { cardClass, inputClass } from '@/components/layout';

interface AddFilterButtonProps {
  fields: SearchField[];
  /** Group order as the schema declares it; unlisted groups fall to the end. */
  groups: string[];
  filters: FilterState;
  facets: Map<string, Facet>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (key: string, value: FilterValue | undefined) => void;
}

interface FieldGroup {
  name: string;
  fields: SearchField[];
}

function groupFields(fields: SearchField[], groups: string[]): FieldGroup[] {
  const order = new Map(groups.map((name, index) => [name, index]));
  const buckets = new Map<string, SearchField[]>();
  for (const field of fields) {
    const bucket = buckets.get(field.group);
    if (bucket) bucket.push(field);
    else buckets.set(field.group, [field]);
  }
  return [...buckets.entries()]
    .map(([name, entries]) => ({ name, fields: entries }))
    .sort((left, right) => (order.get(left.name) ?? groups.length) - (order.get(right.name) ?? groups.length));
}

function matches(field: SearchField, needle: string): boolean {
  if (needle.length === 0) return true;
  return `${field.label} ${field.group} ${field.hint ?? ''}`.toLowerCase().includes(needle);
}

/** A field the current search barely splits on is listed quietly rather than removed. */
function isWeakFacet(facet: Facet | undefined): boolean {
  return facet !== undefined && facet.buckets.length <= 1;
}

/** The whole schema behind one button: pick a field, then the panel becomes that field's editor. */
export function AddFilterButton({
  fields,
  groups,
  filters,
  facets,
  open,
  onOpenChange,
  onChange,
}: AddFilterButtonProps): JSX.Element {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [chosenKey, setChosenKey] = useState<string | null>(null);

  const needle = search.trim().toLowerCase();
  const visibleGroups = useMemo(
    () => groupFields(fields.filter((field) => matches(field, needle)), groups).filter((group) => group.fields.length > 0),
    [fields, groups, needle],
  );
  const flattened = useMemo(() => visibleGroups.flatMap((group) => group.fields), [visibleGroups]);
  // Row numbers run across the whole list, so each group starts where the ones before it ended.
  const groupStarts = useMemo(
    () =>
      visibleGroups.map((_group, index) =>
        visibleGroups.slice(0, index).reduce((total, earlier) => total + earlier.fields.length, 0),
      ),
    [visibleGroups],
  );
  const chosen = chosenKey === null ? undefined : fields.find((field) => field.key === chosenKey);
  const activeRowId = activeIndex < flattened.length ? `${listId}-opt-${String(activeIndex)}` : undefined;

  useEffect(() => {
    if (open) return;
    setSearch('');
    setActiveIndex(0);
    setChosenKey(null);
  }, [open]);

  useEffect(() => {
    if (open && chosenKey === null) searchRef.current?.focus();
  }, [open, chosenKey]);

  useEffect(() => setActiveIndex(0), [needle]);
  useOptionScroll(panelRef, activeIndex);
  useDismissOnOutsidePointer(panelRef, triggerRef, () => onOpenChange(false), open && chosenKey === null);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      triggerRef.current?.focus();
      onOpenChange(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (flattened.length === 0) return;
      setActiveIndex((current) => nextIndex(current, event.key as 'ArrowDown' | 'ArrowUp', flattened.length));
      return;
    }
    if (event.key === 'Enter' && flattened.length > 0) {
      event.preventDefault();
      setChosenKey(flattened[activeIndex].key);
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => onOpenChange(!open)}
        className={clsx(
          'flex items-center gap-1 rounded border border-dashed border-line px-2.5 py-1.5 text-sm text-muted hover:border-accent hover:text-accent',
          focusRing,
        )}
      >
        <span aria-hidden="true">+</span> Add filter
      </button>

      {open && chosen !== undefined && (
        <FilterPopover
          key={chosen.key}
          field={chosen}
          value={filters[chosen.key]}
          facet={facets.get(chosen.key)}
          anchorRef={triggerRef}
          onBack={() => setChosenKey(null)}
          onApply={(value) => onChange(chosen.key, value)}
          onClose={() => onOpenChange(false)}
        />
      )}

      {open && chosen === undefined && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Add a filter"
          onKeyDown={handleKeyDown}
          className={clsx('absolute top-full left-0 z-30 mt-1 flex w-[min(22rem,90vw)] flex-col shadow-lg', cardClass)}
        >
          <div className="p-2">
            <input
              ref={searchRef}
              type="search"
              role="combobox"
              aria-expanded={true}
              aria-controls={listId}
              aria-activedescendant={activeRowId}
              autoComplete="off"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search all fields"
              aria-label="Search all fields"
              className={inputClass}
            />
          </div>
          <div className="max-h-80 overflow-y-auto pb-2">
            {flattened.length === 0 && <p className="px-3 py-2 text-xs text-muted">No field matches.</p>}
            <div id={listId} role="listbox" aria-label="Fields">
              {visibleGroups.map((group, groupIndex) => (
                <div key={group.name} role="group" aria-label={group.name}>
                  <p aria-hidden="true" className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">
                    {group.name}
                  </p>
                  {group.fields.map((field, offset) => {
                    const rowIndex = groupStarts[groupIndex] + offset;
                    const facet = facets.get(field.key);
                    return (
                      <button
                        key={field.key}
                        type="button"
                        role="option"
                        id={`${listId}-opt-${String(rowIndex)}`}
                        aria-selected={rowIndex === activeIndex}
                        data-index={rowIndex}
                        tabIndex={-1}
                        onClick={() => setChosenKey(field.key)}
                        onMouseEnter={() => setActiveIndex(rowIndex)}
                        className={clsx(
                          'flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm',
                          rowIndex === activeIndex ? 'bg-accent/10' : 'hover:bg-line/60',
                          isWeakFacet(facet) && 'text-muted',
                        )}
                      >
                        <span className="flex-1 truncate">
                          {field.label}
                          {field.hint !== undefined && (
                            <span className="ml-2 text-xs text-muted">{field.hint}</span>
                          )}
                        </span>
                        {filters[field.key] !== undefined && (
                          <span aria-label="active" className="text-xs text-accent">
                            ✓
                          </span>
                        )}
                        {facet !== undefined && (
                          <span className="text-xs tabular-nums text-muted">{facet.buckets.length}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
