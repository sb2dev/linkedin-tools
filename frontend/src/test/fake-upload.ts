interface ProgressLike {
  lengthComputable: boolean;
  loaded: number;
  total: number;
}

export interface PendingUpload {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  /** The file the panel attached, read back off the multipart body it built. */
  readonly file: File | null;
  reportProgress(loaded: number, total: number): void;
  succeed(body: unknown): void;
  fail(status: number, statusText: string, body: unknown): void;
  answerWith(status: number, text: string): void;
  breakConnection(): void;
}

export interface UploadStub {
  readonly uploads: readonly PendingUpload[];
  readonly last: PendingUpload;
  restore(): void;
}

/** Replaces global XMLHttpRequest. Restore it in an afterEach. */
export function stubUploads(): UploadStub {
  const uploads: PendingUpload[] = [];
  const original = globalThis.XMLHttpRequest;

  class FakeXhr {
    status = 0;
    statusText = '';
    responseText = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readonly upload: { onprogress: ((event: ProgressLike) => void) | null } = { onprogress: null };

    private method = '';
    private url = '';
    private readonly headers: Record<string, string> = {};

    open(method: string, url: string): void {
      this.method = method;
      this.url = url;
    }

    setRequestHeader(name: string, value: string): void {
      this.headers[name] = value;
    }

    send(body: FormData): void {
      const attached = body.get('file');
      const request = this;
      uploads.push({
        method: request.method,
        url: request.url,
        headers: { ...request.headers },
        file: attached instanceof File ? attached : null,
        reportProgress(loaded: number, total: number): void {
          request.upload.onprogress?.({ lengthComputable: true, loaded, total });
        },
        answerWith(status: number, text: string): void {
          request.status = status;
          request.responseText = text;
          request.onload?.();
        },
        succeed(payload: unknown): void {
          this.answerWith(200, JSON.stringify(payload));
        },
        fail(status: number, statusText: string, payload: unknown): void {
          request.statusText = statusText;
          this.answerWith(status, JSON.stringify(payload));
        },
        breakConnection(): void {
          request.onerror?.();
        },
      });
    }
  }

  globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;

  return {
    uploads,
    get last(): PendingUpload {
      const found = uploads[uploads.length - 1];
      if (!found) throw new Error('no upload was started');
      return found;
    },
    restore(): void {
      globalThis.XMLHttpRequest = original;
    },
  };
}
