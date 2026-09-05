import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useDebouncedValue, useSuggestions } from '@/hooks/use-search';
import type { FilterValue, SearchField } from '@/types/api';
import { nextIndex, useOptionScroll } from '../list-nav';
import { inputClass } from '@/components/layout';
import { OptionRow, SelectedTermList, selectedTerms, termsValue, toggleTerm } from './TermsControl';

interface TypeaheadControlProps {
  field: SearchField;
  value: FilterValue | undefined;
  onChange: (value: FilterValue | undefined) => void;
}

const DEBOUNCE_MS = 200;

/** Fields such as skills hold thousands of values, so options are fetched per prefix, not faceted. */
export function TypeaheadControl({ field, value, onChange }: TypeaheadControlProps): JSX.Element {
  const selected = selectedTerms(value);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const prefix = useDebouncedValue(search.trim().toLowerCase(), DEBOUNCE_MS);
  const suggestions = useSuggestions(field.key, prefix);

  // A blank suggestion would render an unlabelled row and add an empty term, so it is dropped here.
  const visible = useMemo(
    () => (suggestions.data ?? []).filter((entry) => entry.length > 0 && !selected.includes(entry)),
    [suggestions.data, selected],
  );

  const typed = search.trim().toLowerCase();
  const canAddTyped = typed.length > 0 && !visible.includes(typed) && !selected.includes(typed);
  const rowCount = visible.length + (canAddTyped ? 1 : 0);
  // The row list shrinks the moment a term is picked, a debounce ahead of the reset on `prefix`.
  const active = rowCount === 0 ? 0 : Math.min(activeIndex, rowCount - 1);
  const activeRowId = rowCount === 0 ? undefined : `${listId}-opt-${String(active)}`;

  useEffect(() => setActiveIndex(0), [prefix]);
  useOptionScroll(listRef, active);

  function commit(term: string): void {
    onChange(termsValue(toggleTerm(selected, term)));
    setSearch('');
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (rowCount === 0) return;
      setActiveIndex(nextIndex(active, event.key, rowCount));
      return;
    }
    if (event.key !== 'Enter' || rowCount === 0) return;
    event.stopPropagation();
    event.preventDefault();
    commit(active < visible.length ? visible[active] : typed);
  }

  return (
    <div className="flex flex-col gap-2">
      <SelectedTermList values={selected} onRemove={(entry) => onChange(termsValue(toggleTerm(selected, entry)))} />
      <input
        type="search"
        role="combobox"
        aria-expanded={rowCount > 0}
        aria-controls={listId}
        aria-activedescendant={activeRowId}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Type to find ${field.label.toLowerCase()}`}
        aria-label={`Search ${field.label}`}
        autoComplete="off"
        className={inputClass}
      />
      {prefix.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted">Start typing to see matching values.</p>
      ) : suggestions.isPending ? (
        <p className="px-1 py-2 text-xs text-muted">Searching…</p>
      ) : suggestions.isError ? (
        <p className="px-1 py-2 text-xs text-negative">Suggestions are unavailable right now.</p>
      ) : (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={field.label}
          className="max-h-56 overflow-y-auto"
        >
          {visible.map((entry, index) => (
            <OptionRow
              key={entry}
              id={`${listId}-opt-${String(index)}`}
              option={{ value: entry }}
              index={index}
              checked={false}
              active={index === active}
              onToggle={() => commit(entry)}
            />
          ))}
          {canAddTyped && (
            <OptionRow
              key="__typed"
              id={`${listId}-opt-${String(visible.length)}`}
              option={{ value: typed }}
              index={visible.length}
              checked={false}
              active={active === visible.length}
              onToggle={() => commit(typed)}
            />
          )}
        </ul>
      )}
    </div>
  );
}
