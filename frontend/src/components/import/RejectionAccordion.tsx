import { useState } from 'react';
import type { JSX } from 'react';
import clsx from 'clsx';
import type { RejectionGroup } from '@/types/api';
import { cardClass } from '@/components/layout';
import { formatNumber } from '@/lib/format';

/** A summary, not a listing: enough lines to recognise the shape of the problem. */
const MAX_SHOWN_SAMPLES = 3;

export interface RejectionAccordionProps {
  rejections: RejectionGroup[];
}

/** Summarised per reason, with the sample lines opened on demand. */
export function RejectionAccordion({ rejections }: RejectionAccordionProps): JSX.Element | null {
  const [openReason, setOpenReason] = useState<string | null>(null);

  if (rejections.length === 0) return null;
  const total = rejections.reduce((sum, rejection) => sum + rejection.count, 0);

  return (
    <section>
      <h3 className="text-sm font-medium">
        Rejected rows
        <span className="ml-2 text-xs font-normal text-muted">{formatNumber(total)} in total</span>
      </h3>
      <ul className={clsx(cardClass, 'mt-1 divide-y divide-line')}>
        {rejections.map((rejection) => {
          const open = openReason === rejection.reason;
          const panelId = `rejection-${rejection.reason}`;
          return (
            <li key={rejection.reason}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenReason(open ? null : rejection.reason)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-line/40"
              >
                <span aria-hidden="true" className="text-xs text-muted">
                  {open ? '▾' : '▸'}
                </span>
                <span className="flex-1">{rejection.label}</span>
                <span className="tabular-nums text-muted">{formatNumber(rejection.count)}</span>
              </button>
              {open && (
                <div id={panelId} className="px-3 pb-3">
                  {rejection.samples.length === 0 ? (
                    <p className="text-xs text-muted">No sample lines were captured.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {rejection.samples.slice(0, MAX_SHOWN_SAMPLES).map((sample) => (
                        <li key={sample.lineNumber} className="flex gap-2 text-xs">
                          <span className="shrink-0 tabular-nums text-muted">line {sample.lineNumber}</span>
                          <code className="min-w-0 flex-1 truncate rounded bg-line/50 px-1 py-0.5 font-mono">
                            {sample.excerpt}
                          </code>
                        </li>
                      ))}
                    </ul>
                  )}
                  {rejection.samples.length > MAX_SHOWN_SAMPLES && (
                    <p className="mt-1 text-xs text-muted">
                      and {formatNumber(rejection.samples.length - MAX_SHOWN_SAMPLES)} more sample lines like these.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
