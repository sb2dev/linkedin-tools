import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react';
import clsx from 'clsx';
import type { Facet, FilterValue, SearchField } from '@/types/api';
import { nextIndex, useOptionScroll } from '../list-nav';
import { inputClass } from '@/components/layout';

interface TermsControlProps {
  field: SearchField;
  value: FilterValue | undefined;
  /** Buckets for the current search, so counts narrow as other filters are applied. */
  facet?: Facet;
  onChange: (value: FilterValue | undefined) => void;
}

interface TermOption {
  value: string;
  count?: number;
}

const NO_TERMS: string[] = [];

export function selectedTerms(value: FilterValue | undefined): string[] {
  return value?.type === 'terms' ? value.values : NO_TERMS;
}

export function termsValue(values: string[]): FilterValue | undefined {
  return values.length > 0 ? { type: 'terms', values } : undefined;
}

export function toggleTerm(values: string[], term: string): string[] {
  return values.includes(term) ? values.filter((entry) => entry !== term) : [...values, term];
}

/** Shows the current selection so a value chosen earlier stays visible when the option list moves. */
export function SelectedTermList({
  values,
  onRemove,
}: {
  values: string[];
  onRemove: (value: string) => void;
}): JSX.Element | null {
  if (values.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((entry) => (
        <button
          key={entry}
          type="button"
          onClick={() => onRemove(entry)}
          className="flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent hover:bg-accent/20"
        >
          <span className="max-w-40 truncate">{entry}</span>
          <span aria-hidden="true">&times;</span>
          <span className="sr-only">Remove {entry}</span>
        </button>
      ))}
    </div>
  );
}

/** A selected value that no longer matches the query keeps its row so it can still be unselected. */
export function mergeOptions(
  facet: Facet | undefined,
  registryOptions: string[] | undefined,
  selected: string[],
): TermOption[] {
  const options: TermOption[] = [];
  const seen = new Set<string>();
  for (const bucket of facet?.buckets ?? []) {
    seen.add(bucket.value);
    options.push({ value: bucket.value, count: bucket.count });
  }
  for (const option of registryOptions ?? []) {
    if (seen.has(option)) continue;
    seen.add(option);
    options.push({ value: option });
  }
  for (const entry of selected) {
    if (seen.has(entry)) continue;
    seen.add(entry);
    options.push({ value: entry });
  }
  return options;
}

export function OptionRow({
  id,
  option,
  checked,
  active,
  index,
  onToggle,
}: {
  id: string;
  option: TermOption;
  checked: boolean;
  active: boolean;
  index: number;
  onToggle: () => void;
}): JSX.Element {
  return (
    <li role="none">
      <button
        id={id}
        type="button"
        data-index={index}
        role="option"
        aria-selected={checked}
        tabIndex={-1}
        onClick={onToggle}
        className={clsx(
          'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
          active ? 'bg-accent/10' : 'hover:bg-line/60',
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            'flex size-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none',
            checked ? 'border-accent bg-accent text-white' : 'border-line',
          )}
        >
          {checked ? '✓' : ''}
        </span>
        <span className="flex-1 truncate">{option.value}</span>
        {option.count !== undefined && (
          <span className="shrink-0 text-xs tabular-nums text-muted">{option.count}</span>
        )}
      </button>
    </li>
  );
}

export function TermsControl({ field, value, facet, onChange }: TermsControlProps): JSX.Element {
  const selected = selectedTerms(value);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const options = useMemo(
    () => mergeOptions(facet, field.options, selected),
    [facet, field.options, selected],
  );

  const needle = search.trim().toLowerCase();
  const visible = useMemo(
    () => (needle.length === 0 ? options : options.filter((option) => option.value.includes(needle))),
    [options, needle],
  );

  const exactMatch = visible.some((option) => option.value === needle);
  const canAddTyped = needle.length > 0 && !exactMatch;
  const rowCount = visible.length + (canAddTyped ? 1 : 0);
  const activeRowId = activeIndex < rowCount ? `${listId}-opt-${String(activeIndex)}` : undefined;

  useEffect(() => setActiveIndex(0), [needle]);
  useOptionScroll(listRef, activeIndex);

  function commit(term: string): void {
    onChange(termsValue(toggleTerm(selected, term)));
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (rowCount === 0) return;
      setActiveIndex((current) => nextIndex(current, event.key as 'ArrowDown' | 'ArrowUp', rowCount));
      return;
    }
    if (event.key !== 'Enter' || rowCount === 0) return;
    // The popover applies on Enter; inside the list Enter picks a value instead.
    event.stopPropagation();
    event.preventDefault();
    if (activeIndex < visible.length) commit(visible[activeIndex].value);
    else commit(needle);
    setSearch('');
  }

  return (
    <div className="flex flex-col gap-2">
      <SelectedTermList values={selected} onRemove={commit} />
      <input
        type="search"
        role="combobox"
        aria-expanded={rowCount > 0}
        aria-controls={listId}
        aria-activedescendant={activeRowId}
        autoComplete="off"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Search ${field.label.toLowerCase()}`}
        aria-label={`Search ${field.label}`}
        className={inputClass}
      />
      {rowCount === 0 ? (
        // Only an empty option list gets here: any typed text offers itself as the one row.
        <p className="px-1 py-2 text-xs text-muted">
          No values for the current search. Type a value and press Enter to filter by it anyway.
        </p>
      ) : (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={field.label}
          className="max-h-56 overflow-y-auto"
        >
          {visible.map((option, index) => (
            <OptionRow
              key={option.value}
              id={`${listId}-opt-${String(index)}`}
              option={option}
              index={index}
              checked={selected.includes(option.value)}
              active={index === activeIndex}
              onToggle={() => commit(option.value)}
            />
          ))}
          {canAddTyped && (
            <OptionRow
              key="__typed"
              id={`${listId}-opt-${String(visible.length)}`}
              option={{ value: needle }}
              index={visible.length}
              checked={false}
              active={activeIndex === visible.length}
              onToggle={() => {
                commit(needle);
                setSearch('');
              }}
            />
          )}
        </ul>
      )}
      {facet !== undefined && facet.otherCount > 0 && (
        <p className="text-xs text-muted">{facet.otherCount} more values not shown.</p>
      )}
    </div>
  );
}
