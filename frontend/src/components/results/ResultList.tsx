import type { ReactElement } from 'react';
import clsx from 'clsx';
import { cardClass } from '@/components/layout';
import { ResultCard } from '@/components/results/ResultCard';
import type { ProfileSummary } from '@/types/api';

interface ResultListProps {
  items: ProfileSummary[];
  /** Dimmed while a new page loads over the previous one. */
  stale?: boolean;
}

export function ResultList({ items, stale = false }: ResultListProps): ReactElement {
  return (
    <ul className={stale ? 'space-y-3 opacity-60 transition-opacity' : 'space-y-3'}>
      {items.map((profile) => (
        <ResultCard key={profile.linkedinUsername} profile={profile} />
      ))}
    </ul>
  );
}

/** Placeholder rows while the first page loads, shaped like the cards that replace them. */
export function ResultSkeleton({ count = 5 }: { count?: number }): ReactElement {
  return (
    <div aria-hidden="true" className="space-y-3">
      {Array.from({ length: count }, (_unused, index) => (
        <div key={index} className={clsx(cardClass, 'animate-pulse p-4')}>
          <div className="h-4 w-40 rounded bg-line" />
          <div className="mt-2 h-3 w-64 max-w-full rounded bg-line" />
          <div className="mt-2 h-3 w-48 max-w-full rounded bg-line" />
          <div className="mt-3 flex gap-1.5">
            {Array.from({ length: 4 }, (_skill, skillIndex) => (
              <div key={skillIndex} className="h-5 w-16 rounded bg-line" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
