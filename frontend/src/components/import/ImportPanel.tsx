import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccessToken, problemFrom, problemFromJson } from '@/api/client';
import { commitImport } from '@/api/imports';
import { useAuth } from '@/hooks/use-auth';
import { ApiError, type ImportCommitResult, type ImportPreview, type ProblemDetails } from '@/types/api';
import { buttonClass, focusRing } from '@/components/layout';
import { formatNumber } from '@/lib/format';
import { countsUnder } from './preview-rows';
import { FileDropzone } from './FileDropzone';
import { PreviewReview } from './PreviewReview';
import { Tile } from './PreviewSummary';
import { LoginPrompt } from './LoginPrompt';

const STEPS = ['Choose a file', 'Review the preview', 'Confirm the import'] as const;

/** A failed index is retried in bulk from the admin endpoint, so a few names are enough to see. */
const MAX_LISTED_INDEX_FAILURES = 10;

function problemFromUpload(request: XMLHttpRequest): ProblemDetails {
  const title = request.statusText.length > 0 ? request.statusText : 'Upload failed';
  try {
    return problemFromJson(JSON.parse(request.responseText), request.status, title);
  } catch {
    // A body that is not a problem document came from something other than the API, such as a proxy.
    return problemFrom(request.status, title);
  }
}

/** XMLHttpRequest rather than the shared fetch client: only XHR reports upload progress. */
function uploadPreview(file: File, onProgress: (percent: number) => void): Promise<ImportPreview> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const body = new FormData();
    body.append('file', file, file.name);

    request.open('POST', '/api/imports');
    request.setRequestHeader('Accept', 'application/json');
    const token = getAccessToken();
    if (token !== null) request.setRequestHeader('Authorization', `Bearer ${token}`);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () =>
      reject(
        new ApiError(
          problemFrom(0, 'Cannot reach the API', 'The upload did not reach the server. Check that the backend is running.'),
        ),
      );
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new ApiError(problemFromUpload(request)));
        return;
      }
      try {
        resolve(JSON.parse(request.responseText) as ImportPreview);
      } catch {
        reject(
          new ApiError(problemFrom(request.status, 'Unreadable response', 'The import preview could not be parsed.')),
        );
      }
    };

    request.send(body);
  });
}

function errorMessage(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong.';
}

function StepTrail({ current }: { current: number }): JSX.Element {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {STEPS.map((step, index) => (
        <li key={step} className="flex items-center gap-2">
          {index > 0 && (
            <span aria-hidden="true" className="text-line">
              /
            </span>
          )}
          <span className={clsx(index === current ? 'font-medium text-accent' : 'text-muted')}>
            {index + 1}. {step}
          </span>
        </li>
      ))}
    </ol>
  );
}

function CommitResult({
  result,
  onReset,
}: {
  result: ImportCommitResult;
  onReset: () => void;
}): JSX.Element {
  const { committed } = result;
  const unlisted = committed.indexFailures.length - MAX_LISTED_INDEX_FAILURES;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">Import complete</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Profiles inserted" value={committed.profilesInserted} />
        <Tile label="Profiles updated" value={committed.profilesUpdated} />
        <Tile label="Documents indexed" value={committed.indexed} />
        <Tile label="Index failures" value={committed.indexFailures.length} />
      </div>

      {committed.indexFailures.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
          <p className="text-sm font-medium text-warning">
            {formatNumber(committed.indexFailures.length)} profiles were stored but not indexed
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-warning">
            {committed.indexFailures.slice(0, MAX_LISTED_INDEX_FAILURES).map((failure) => (
              <li key={failure} className="truncate font-mono">
                {failure}
              </li>
            ))}
          </ul>
          {unlisted > 0 && (
            <p className="mt-1 text-xs text-warning">
              and {formatNumber(unlisted)} more. Re-index from the admin endpoint to retry.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          to="/"
          className={clsx('rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90', focusRing)}
        >
          Search the imported profiles
        </Link>
        <button type="button" onClick={onReset} className={clsx(buttonClass, focusRing)}>
          Import another file
        </button>
      </div>
    </section>
  );
}

function CommitBar({
  preview,
  repair,
  pending,
  onCommit,
  onCancel,
}: {
  preview: ImportPreview;
  repair: boolean;
  pending: boolean;
  onCommit: () => void;
  onCancel: () => void;
}): JSX.Element {
  const counts = countsUnder(preview, repair);
  const profiles = counts.profilesNew + counts.profilesUpdated + counts.profilesUnchanged;

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onCommit}
          className={clsx(
            'rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40',
            focusRing,
          )}
        >
          {pending
            ? 'Importing…'
            : `Import ${formatNumber(counts.rowsAccepted)} rows`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="ml-auto rounded px-2 py-1.5 text-sm text-muted hover:text-ink disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-muted">
        {/* Rows are not profiles: the duplicates collapse before anything is written. */}
        {formatNumber(counts.rowsAccepted)} accepted rows become {formatNumber(profiles)} profiles ·{' '}
        {formatNumber(counts.profilesNew)} new · {formatNumber(counts.profilesUpdated)} updated ·{' '}
        {formatNumber(counts.profilesUnchanged)} unchanged · {formatNumber(counts.rowsRejected)} rows left behind
      </p>
    </div>
  );
}

/** Choose a file, review the preview, confirm. Nothing is written until the confirm step. */
export function ImportPanel(): JSX.Element {
  const { token, username, signOut } = useAuth();
  const queryClient = useQueryClient();

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [committed, setCommitted] = useState<ImportCommitResult | null>(null);
  const [progress, setProgress] = useState(0);
  // Repair is opt-in per file, so every new preview starts from "leave the rows as they parsed".
  const [repair, setRepair] = useState(false);

  const upload = useMutation({
    mutationFn: (file: File) => uploadPreview(file, setProgress),
    onMutate: () => setProgress(0),
    onSuccess: (result) => {
      setPreview(result);
      setRepair(false);
    },
  });

  const commit = useMutation({
    mutationFn: (input: { importId: string; repair: boolean }) =>
      commitImport(input.importId, input.repair),
    onSuccess: (result) => {
      setCommitted(result);
      // Every cached search and profile now describes a corpus that has changed underneath it.
      void queryClient.invalidateQueries({ queryKey: ['search'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  const failure = upload.error ?? commit.error;

  // An expired token surfaces as a 401 on whichever call used it; dropping it brings back the form.
  useEffect(() => {
    if (failure instanceof ApiError && failure.isUnauthorized) signOut();
  }, [failure, signOut]);

  function reset(): void {
    setPreview(null);
    setCommitted(null);
    setProgress(0);
    setRepair(false);
    upload.reset();
    commit.reset();
  }

  if (token === null) {
    return (
      <LoginPrompt
        reason={
          failure instanceof ApiError && failure.isUnauthorized
            ? 'That session has expired. Sign in again to finish the import.'
            : undefined
        }
      />
    );
  }

  const step = committed !== null ? 2 : preview !== null ? 1 : 0;
  const message = errorMessage(failure);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StepTrail current={step} />
        <p className="text-xs text-muted">
          {/* The store writes the name with the token, so a held session always carries one. */}
          Signed in as {username}
          <button
            type="button"
            onClick={signOut}
            className="ml-2 underline underline-offset-2 hover:text-ink"
          >
            Sign out
          </button>
        </p>
      </div>

      {committed !== null ? (
        <CommitResult result={committed} onReset={reset} />
      ) : preview === null ? (
        <FileDropzone
          onSelect={(file) => upload.mutate(file)}
          uploading={upload.isPending}
          progress={progress}
          error={message}
        />
      ) : (
        <>
          <PreviewReview preview={preview} repair={repair} onRepairChange={setRepair} />

          {message !== null && <p className="text-sm text-negative">{message}</p>}

          <CommitBar
            preview={preview}
            repair={repair}
            pending={commit.isPending}
            onCommit={() => commit.mutate({ importId: preview.importId, repair })}
            onCancel={reset}
          />
        </>
      )}
    </div>
  );
}
