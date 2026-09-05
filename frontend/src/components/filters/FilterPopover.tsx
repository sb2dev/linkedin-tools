import { useEffect, useRef, useState } from 'react';
import type { JSX, KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import clsx from 'clsx';
import type { Facet, FilterValue, SearchField } from '@/types/api';
import { cardClass, focusRing } from '@/components/layout';
import { useDismissOnOutsidePointer } from './list-nav';
import { TermsControl } from './controls/TermsControl';
import { TypeaheadControl } from './controls/TypeaheadControl';
import { OrderedTermsControl } from './controls/OrderedTermsControl';
import { RangeControl } from './controls/RangeControl';
import { DateRangeControl } from './controls/DateRangeControl';
import { ExistsControl } from './controls/ExistsControl';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface FilterPopoverProps {
  field: SearchField;
  value: FilterValue | undefined;
  facet?: Facet;
  /** The trigger, so clicking it to close does not count as a click outside, and focus can go back to it. */
  anchorRef?: RefObject<HTMLElement | null>;
  onApply: (value: FilterValue | undefined) => void;
  onClose: () => void;
  onBack?: () => void;
}

/** Picks the control from the field's declared kind, so a new backend field needs no change here. */
function ControlFor({
  field,
  draft,
  facet,
  onChange,
}: {
  field: SearchField;
  draft: FilterValue | undefined;
  facet?: Facet;
  onChange: (value: FilterValue | undefined) => void;
}): JSX.Element {
  switch (field.kind) {
    case 'terms':
      return field.typeahead === true ? (
        <TypeaheadControl field={field} value={draft} onChange={onChange} />
      ) : (
        <TermsControl field={field} value={draft} facet={facet} onChange={onChange} />
      );
    case 'ordered_terms':
      return <OrderedTermsControl field={field} value={draft} facet={facet} onChange={onChange} />;
    case 'range':
      return <RangeControl field={field} value={draft} onChange={onChange} />;
    case 'date_range':
      return <DateRangeControl field={field} value={draft} onChange={onChange} />;
    case 'exists':
      return <ExistsControl field={field} value={draft} onChange={onChange} />;
  }
}

/** Edits one filter on a draft value: Escape abandons it, Enter and Apply commit it. */
export function FilterPopover({
  field,
  value,
  facet,
  anchorRef,
  onApply,
  onClose,
  onBack,
}: FilterPopoverProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<FilterValue | undefined>(value);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [field.key]);

  useDismissOnOutsidePointer(panelRef, anchorRef, onClose);

  // The panel unmounts with focus inside it, so the trigger has to be refocused by hand.
  function close(): void {
    anchorRef?.current?.focus();
    onClose();
  }

  function commit(next: FilterValue | undefined): void {
    onApply(next);
    close();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }

    const target = event.target as HTMLElement;
    const isButton = target.tagName === 'BUTTON' || target.tagName === 'A';

    if (event.key === 'Enter' && !isButton) {
      event.preventDefault();
      commit(draft);
      return;
    }

    if (event.key !== 'Tab') return;
    // currentTarget is the panel itself, which always holds at least the Clear and Apply buttons.
    const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
    const edge = event.shiftKey ? nodes[0] : nodes[nodes.length - 1];
    if (document.activeElement !== edge) return;
    event.preventDefault();
    (event.shiftKey ? nodes[nodes.length - 1] : nodes[0]).focus();
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Filter by ${field.label}`}
      onKeyDown={handleKeyDown}
      className={clsx('absolute top-full left-0 z-30 mt-1 w-[min(22rem,90vw)] p-3 shadow-lg', cardClass)}
    >
      <div className="mb-2 flex items-start gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to the field list"
            className="rounded px-1 text-muted hover:bg-line/60 hover:text-ink"
          >
            ‹
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{field.label}</p>
          <p className="text-xs text-muted">{field.hint ?? field.group}</p>
        </div>
      </div>

      <ControlFor field={field} draft={draft} facet={facet} onChange={setDraft} />

      <div className="mt-3 flex items-center justify-between border-t border-line pt-2">
        <button
          type="button"
          onClick={() => commit(undefined)}
          className={clsx('rounded px-2 py-1 text-xs text-muted hover:bg-line/60 hover:text-ink', focusRing)}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => commit(draft)}
          className={clsx('rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90', focusRing)}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
