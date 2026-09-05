import { useRef, useState } from 'react';
import type { DragEvent, JSX } from 'react';
import clsx from 'clsx';
import { buttonClass, focusRing } from '@/components/layout';
import { formatBytes } from '@/lib/format';

/** Both limits mirror the API: UPLOAD_MAX_BYTES and the extension check in ImportsController. */
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['.csv', '.json'] as const;

export interface FileDropzoneProps {
  onSelect: (file: File) => void;
  uploading: boolean;
  /** Percentage of the request body sent, 0 to 100. */
  progress: number;
  /** Failure reported by the caller, such as a rejected upload. */
  error?: string | null;
}

/** Rejects the obvious mistakes before a multi-megabyte body is sent over the wire. */
export function validateFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return `${file.name} is not a ${ACCEPTED_EXTENSIONS.join(', ')} file.`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is ${formatBytes(file.size)}, over the ${formatBytes(MAX_UPLOAD_BYTES)} limit.`;
  }
  return null;
}

export function FileDropzone({ onSelect, uploading, progress, error }: FileDropzoneProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);

  function accept(file: File | undefined): void {
    if (file === undefined) return;
    const problem = validateFile(file);
    setRejected(problem);
    if (problem === null) onSelect(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragging(false);
    if (uploading) return;
    accept(event.dataTransfer.files[0]);
  }

  const message = rejected ?? error ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={clsx(
          'rounded-lg border-2 border-dashed p-8 text-center',
          dragging ? 'border-accent bg-accent/5' : 'border-line',
        )}
      >
        <p className="text-sm">Drop the dataset export here</p>
        <p className="mt-1 text-xs text-muted">
          {ACCEPTED_EXTENSIONS.join(', ')} up to {formatBytes(MAX_UPLOAD_BYTES)}
        </p>
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className={clsx(buttonClass, focusRing, 'mt-3')}
        >
          {uploading ? 'Uploading…' : 'Choose a file'}
        </button>
        {/* sr-only leaves the input focusable, so the labelled button above is the only tab stop. */}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            accept(event.target.files?.[0]);
            // Reset so choosing the same file twice still fires a change event.
            event.target.value = '';
          }}
        />
      </div>

      {uploading && (
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
              style={{ width: `${progress}%` }}
              className="h-full rounded-full bg-accent transition-[width] duration-150"
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            {progress < 100 ? `Uploading ${progress}%` : 'Analysing the file…'}
          </p>
        </div>
      )}

      {message !== null && <p className="text-sm text-negative">{message}</p>}
    </div>
  );
}
