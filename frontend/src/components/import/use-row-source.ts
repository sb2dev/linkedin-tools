/** Loads the source line behind one preview row, for the dialog that shows it. */

import { useEffect, useRef, useState } from 'react';
import { getRowSource } from '@/api/imports';
import type { ImportRowSource } from '@/types/api';

export type RowSourceState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly source: ImportRowSource }
  | { readonly status: 'error'; readonly error: Error };

export interface RowSourceView {
  /** The line the dialog is open on, or null while it is closed. */
  readonly lineNumber: number | null;
  readonly state: RowSourceState;
  open: (lineNumber: number) => void;
  close: () => void;
  retry: () => void;
}

const LOADING: RowSourceState = { status: 'loading' };

export function useRowSource(importId: string): RowSourceView {
  const cache = useRef(new Map<number, ImportRowSource>());
  const [lineNumber, setLineNumber] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RowSourceState>(LOADING);

  useEffect(() => {
    if (lineNumber === null) return undefined;
    if (cache.current.has(lineNumber)) return undefined;

    const controller = new AbortController();
    getRowSource(importId, lineNumber, controller.signal)
      .then((source) => {
        cache.current.set(lineNumber, source);
        setState({ status: 'ready', source });
      })
      .catch((error: Error) => {
        // The dialog was closed, or moved to another line, while this request was in flight.
        if (controller.signal.aborted) return;
        setState({ status: 'error', error });
      });

    return () => {
      controller.abort();
    };
  }, [importId, lineNumber, attempt]);

  return {
    lineNumber,
    state,
    open: (line: number): void => {
      // A line already read is shown on the same tick, so reopening it never flashes a spinner.
      const known = cache.current.get(line);
      setState(known === undefined ? LOADING : { status: 'ready', source: known });
      setLineNumber(line);
    },
    close: (): void => {
      setLineNumber(null);
    },
    retry: (): void => {
      setState(LOADING);
      setAttempt((count) => count + 1);
    },
  };
}
