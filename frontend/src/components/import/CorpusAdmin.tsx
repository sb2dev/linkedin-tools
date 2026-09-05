import { useState } from 'react';
import type { JSX } from 'react';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PURGE_CONFIRMATION,
  getCorpusStatus,
  purgeCorpus,
  type CorpusStatus,
  type LastImport,
  type PurgeResult,
} from '@/api/admin';
import { useAuth } from '@/hooks/use-auth';
import { cardClass, focusRing, inputClass } from '@/components/layout';
import { formatNumber, pluralize } from '@/lib/format';

/** Filled, red, and never the first thing the section offers. */
const dangerButtonClass =
  'inline-flex items-center justify-center rounded-full bg-negative px-4 py-1.5 text-sm font-semibold ' +
  'text-white transition-colors hover:bg-negative/90 disabled:cursor-not-allowed disabled:opacity-40';

const dangerOutlineClass =
  'inline-flex items-center justify-center rounded-full border border-negative/40 px-4 py-1.5 text-sm ' +
  'font-semibold text-negative transition-colors hover:bg-negative/10 disabled:cursor-not-allowed disabled:opacity-40';

const quietClass = 'rounded-full px-3 py-1.5 text-sm text-muted hover:text-ink disabled:opacity-40';

function ImportLine({ last }: { last: LastImport }): JSX.Element {
  return (
    <p className="text-xs text-muted">
      Last import: <span className="text-ink">{last.filename}</span> ·{' '}
      {new Date(last.committedAt).toLocaleString()} · {formatNumber(last.rowsAccepted)} rows accepted ·{' '}
      {formatNumber(last.profilesNew)} new · {formatNumber(last.profilesUpdated)} updated
    </p>
  );
}

/** What is stored now, in the words the operator is about to destroy it in. */
function CorpusFacts({ status }: { status: CorpusStatus }): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm">
        <span className="text-xl font-semibold tabular-nums">{formatNumber(status.profiles)}</span>{' '}
        {pluralize(status.profiles, 'profile')} stored, all of them from imports.
      </p>
      {status.lastImport === undefined ? (
        <p className="text-xs text-muted">Nothing has been committed yet.</p>
      ) : (
        <ImportLine last={status.lastImport} />
      )}
    </div>
  );
}

/** What the purge actually did, including the half of it that can fail on its own. */
function PurgeReport({ result }: { result: PurgeResult }): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">
        Removed {formatNumber(result.profilesDeleted)}{' '}
        {pluralize(result.profilesDeleted, 'profile')}. The import history was kept.
      </p>
      {result.indexCleared ? (
        <p className="text-xs text-muted">
          The corpus and the search index are both empty. Upload a file above to fill them again.
        </p>
      ) : (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
          <p className="font-medium text-warning">The profiles are gone, the search index is not.</p>
          <p className="mt-1">
            {result.indexError ?? 'The search engine did not answer.'} Search may still list people who
            no longer exist until POST /api/admin/reindex rebuilds it from the empty corpus.
          </p>
        </div>
      )}
    </div>
  );
}

/** Deleting the corpus, which is the only way back to an empty database. */
export function CorpusAdmin(): JSX.Element | null {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState('');
  const [report, setReport] = useState<PurgeResult | null>(null);

  const status = useQuery({
    queryKey: ['corpus'],
    queryFn: getCorpusStatus,
    enabled: token !== null,
  });

  const purge = useMutation({
    mutationFn: (phrase: string) => purgeCorpus(phrase),
    onSuccess: (result) => {
      setReport(result);
      setArmed(false);
      setTyped('');
      // Everything cached now describes a corpus that has just been emptied.
      void queryClient.invalidateQueries({ queryKey: ['corpus'] });
      void queryClient.invalidateQueries({ queryKey: ['search'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  if (token === null) return null;

  function disarm(): void {
    setArmed(false);
    setTyped('');
    purge.reset();
  }

  // Held in locals so a present error narrows: every failure the api client raises carries a message.
  const readFailure = status.error;
  const purgeFailure = purge.error;
  const stored = status.data;
  const profiles = stored?.profiles ?? 0;
  const confirmed = typed.trim() === PURGE_CONFIRMATION;

  return (
    <section className={clsx(cardClass, 'mt-6 flex flex-col gap-3 border-negative/30 p-4')}>
      <div>
        <h2 className="text-sm font-semibold text-negative">Delete imported data</h2>
        <p className="text-xs text-muted">
          Removes every profile from the database and the search index. The import history stays, so
          you can still see which file was loaded and when. This cannot be undone.
        </p>
      </div>

      {status.isPending && <p className="text-sm text-muted">Reading the corpus…</p>}
      {readFailure !== null && (
        <p className="text-sm text-negative">The corpus could not be read: {readFailure.message}</p>
      )}
      {stored !== undefined && <CorpusFacts status={stored} />}

      {report !== null && <PurgeReport result={report} />}

      {stored !== undefined && profiles === 0 && (
        <p className="text-xs text-muted">There is nothing to delete.</p>
      )}

      {stored !== undefined && profiles > 0 && !armed && (
        <div>
          <button
            type="button"
            onClick={() => {
              setArmed(true);
              setReport(null);
            }}
            className={clsx(dangerOutlineClass, focusRing)}
          >
            Delete all {formatNumber(profiles)} {pluralize(profiles, 'profile')}
          </button>
        </div>
      )}

      {stored !== undefined && profiles > 0 && armed && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <label htmlFor="purge-confirm" className="text-sm">
            This deletes {formatNumber(profiles)} {pluralize(profiles, 'profile')}. Type{' '}
            <span className="font-mono font-semibold">{PURGE_CONFIRMATION}</span> to confirm.
          </label>
          <input
            id="purge-confirm"
            value={typed}
            autoComplete="off"
            disabled={purge.isPending}
            onChange={(event) => setTyped(event.target.value)}
            className={clsx(inputClass, 'max-w-sm font-mono')}
          />
          {purgeFailure !== null && (
            <p className="text-sm text-negative">{purgeFailure.message}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!confirmed || purge.isPending}
              onClick={() => purge.mutate(typed.trim())}
              className={clsx(dangerButtonClass, focusRing)}
            >
              {purge.isPending
                ? 'Deleting…'
                : `Delete ${formatNumber(profiles)} ${pluralize(profiles, 'profile')}`}
            </button>
            <button
              type="button"
              onClick={disarm}
              disabled={purge.isPending}
              className={clsx(quietClass, focusRing)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
