import { useEffect, useId, useRef } from 'react';
import type { JSX, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import type { ImportRowSource, SourceColumn, SourceRow } from '@/types/api';
import { cardClass, focusRing } from '@/components/layout';
import { ErrorState } from '@/components/results';
import { formatNumber, pluralize } from '@/lib/format';
import type { PreviewRow } from './preview-rows';
import type { RowSourceState } from './use-row-source';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface SourceDialogProps {
  /** The row as the table already reads it, so the dialog can name the line before the fetch lands. */
  row: PreviewRow;
  state: RowSourceState;
  onClose: () => void;
  onRetry: () => void;
}

/** All five verdicts, so a blank cell and a refused line never read as the same failure. */
function Verdict({ column }: { column: SourceColumn }): JSX.Element {
  if (column.verdict === 'kept') {
    // Every column the catalog maps carries a target, so this never renders a bare "Kept as".
    return (
      <span className="text-positive">
        Kept <span className="text-muted">as {column.target}</span>
      </span>
    );
  }

  if (column.verdict === 'quarantined') {
    // A cell is quarantined only where the validator recorded why, so the reason is always here.
    return (
      <span className="text-warning">
        Quarantined<span className="text-muted">: {column.reason}</span>
      </span>
    );
  }

  if (column.verdict === 'empty') {
    return <span className="text-muted">Blank in the file</span>;
  }

  if (column.verdict === 'unmapped') {
    return <span className="text-muted">No field behind this column</span>;
  }

  return <span className="text-muted">Not read: the line was refused first</span>;
}

/** The cells in file order, numbered. */
function Columns({ line }: { line: SourceRow }): JSX.Element {
  if (line.columns.length === 0) {
    return (
      <p className="text-xs text-muted">
        The reader could not split this line into columns, so there is nothing to line up against the
        header.
      </p>
    );
  }

  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 border-b border-line bg-white text-muted">
          <tr>
            <th scope="col" className="py-1 pr-2 font-medium">
              #
            </th>
            <th scope="col" className="py-1 pr-2 font-medium">
              Column
            </th>
            <th scope="col" className="py-1 pr-2 font-medium">
              Value in the file
            </th>
            <th scope="col" className="py-1 font-medium">
              What became of it
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line align-top">
          {line.columns.map((column) => (
            <tr key={column.index}>
              <td className="py-1 pr-2 tabular-nums text-muted">{column.index}</td>
              <td className="py-1 pr-2 font-mono text-muted">
                {column.column ?? <span className="italic">past the header</span>}
              </td>
              <td className="py-1 pr-2 font-mono break-all">{column.value}</td>
              <td className="py-1">
                <Verdict column={column} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** What realignment would read into each column it moves, next to what the row reads today. */

function Shape({ line }: { line: SourceRow }): JSX.Element | null {
  if (line.fieldCount === line.expectedFieldCount && !line.recovered) return null;

  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-medium text-ink">How the line parsed</h3>
      {line.fieldCount !== line.expectedFieldCount && (
        <p className="text-xs text-muted">
          It split into {formatNumber(line.fieldCount)} {pluralize(line.fieldCount, 'field')} where
          the header declares {formatNumber(line.expectedFieldCount)}, so no cell below is certain to
          be in its own column.
        </p>
      )}
      {line.recovered && (
        <p className="text-xs text-muted">
          A path into the source dump opened the line. {formatNumber(line.droppedFields.length)}{' '}
          {pluralize(line.droppedFields.length, 'field')} were dropped before the record was read:{' '}
          <span className="font-mono break-all">{line.droppedFields.join(' | ')}</span>
        </p>
      )}
    </section>
  );
}

function Body({ source }: { source: ImportRowSource }): JSX.Element {
  const line = source.line;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-medium text-ink">The line as the file has it</h3>
        <pre className="max-h-40 overflow-auto rounded border border-line bg-surface p-2 font-mono text-xs whitespace-pre-wrap break-all text-ink">
          {line.raw}
        </pre>
        {line.rawTruncated && (
          <p className="text-xs text-muted">The line is longer than this; the API sent the start of it.</p>
        )}
      </section>

      {line.rejection !== undefined && (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-medium text-ink">Why the line was refused</h3>
          <p className="text-xs text-muted">
            {line.rejection.label} <span className="font-mono">({line.rejection.reason})</span>
          </p>
          <p className="text-xs text-muted">{line.rejection.detail}</p>
        </section>
      )}

      <Shape line={line} />
      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-medium text-ink">The columns the reader made of it</h3>
        <Columns line={line} />
      </section>
    </div>
  );
}

function StateBody({
  row,
  state,
  onRetry,
}: {
  row: PreviewRow;
  state: RowSourceState;
  onRetry: () => void;
}): JSX.Element {
  if (state.status === 'loading') {
    return (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">Reading line {formatNumber(row.lineNumber)} from the file</span>
        {[0, 1, 2, 3].map((index) => (
          <span key={index} aria-hidden="true" className="h-5 w-full animate-pulse rounded bg-line/60" />
        ))}
      </div>
    );
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} onRetry={onRetry} title="The source line did not load" />;
  }

  return <Body source={state.source} />;
}

/** What the file actually said on one line. */
export function SourceDialog({ row, state, onClose, onRetry }: SourceDialogProps): JSX.Element {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement;
    closeRef.current?.focus();
    return () => {
      opener.focus();
    };
  }, []);

  // The page behind must not scroll under the dialog; the panel does its own scrolling.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    // The panel always holds the close button, so the list is never empty.
    const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
    const edge = event.shiftKey ? nodes[0] : nodes[nodes.length - 1];
    if (document.activeElement !== edge) return;
    event.preventDefault();
    (event.shiftKey ? nodes[nodes.length - 1] : nodes[0]).focus();
  }

  function handleBackdrop(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget) return;
    onClose();
  }

  return createPortal(
    <div
      onMouseDown={handleBackdrop}
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className={clsx(cardClass, 'my-4 flex max-h-[85vh] w-full max-w-2xl flex-col shadow-lg')}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-medium text-ink">
              Line {formatNumber(row.lineNumber)} · {row.name}
            </h2>
            <p className="truncate text-xs text-muted">
              What the uploaded file carried on this line
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className={clsx('rounded-full px-2 py-0.5 text-sm text-muted hover:bg-black/5 hover:text-ink', focusRing)}
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <StateBody row={row} state={state} onRetry={onRetry} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
