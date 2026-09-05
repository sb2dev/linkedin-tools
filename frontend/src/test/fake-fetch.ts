/** The one hand-written stand-in for fetch. */

export interface RecordedRequest {
  readonly url: string;
  readonly path: string;
  readonly search: string;
  readonly method: string;
  /** Header names exactly as the client sent them. */
  readonly headers: Readonly<Record<string, string>>;
  /** The body as handed to fetch. */
  readonly body: BodyInit | null;
  /** The body read back as JSON, or the raw string when it is not JSON, or undefined when absent. */
  readonly json: unknown;
}

export interface FakeFetch {
  readonly fetch: typeof fetch;
  readonly requests: readonly RecordedRequest[];
  readonly lastRequest: RecordedRequest;
  readonly callCount: number;
}

/** The short reply shape: a status and a body that is serialised as JSON for you. */
export interface FakeReply {
  status?: number;
  statusText?: string;
  body?: unknown;
}

export interface FetchStub {
  readonly requests: readonly RecordedRequest[];
  restore(): void;
}

type Reply = (request: RecordedRequest) => Response | Promise<Response>;

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

export function problemResponse(status: number, problem: unknown, statusText = 'Bad Request'): Response {
  return new Response(JSON.stringify(problem), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

export function textResponse(status: number, text: string, statusText = ''): Response {
  return new Response(text, { status, statusText, headers: { 'Content-Type': 'text/html' } });
}

function readHeaders(init: RequestInit | undefined): Record<string, string> {
  const source = init?.headers;
  if (source === undefined) return {};
  const entries =
    source instanceof Headers
      ? [...source.entries()]
      : Array.isArray(source)
        ? source
        : Object.entries(source);
  return Object.fromEntries(entries);
}

function readJson(body: BodyInit | null): unknown {
  if (typeof body !== 'string') return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function record(input: RequestInfo | URL, init: RequestInit | undefined): RecordedRequest {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const at = url.indexOf('?');
  const body = (init?.body) ?? null;

  return {
    url,
    path: at < 0 ? url : url.slice(0, at),
    search: at < 0 ? '' : url.slice(at + 1),
    method: init?.method ?? 'GET',
    headers: readHeaders(init),
    body,
    json: readJson(body),
  };
}

/** `reply` decides what comes back; throw from it to simulate a transport failure. */
export function fakeFetch(reply: Reply): FakeFetch {
  const requests: RecordedRequest[] = [];

  const doFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = record(input, init);
    requests.push(request);
    return Promise.resolve(reply(request));
  };

  return {
    fetch: doFetch,
    requests,
    get lastRequest(): RecordedRequest {
      const last = requests[requests.length - 1];
      if (!last) throw new Error('no request was made');
      return last;
    },
    get callCount(): number {
      return requests.length;
    },
  };
}

/** Replaces global fetch with a handler over recorded requests. Restore it in an afterEach. */
export function stubFetch(
  reply: (request: RecordedRequest) => FakeReply | Promise<FakeReply>,
): FetchStub {
  const original = globalThis.fetch;
  const requests: RecordedRequest[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = record(input, init);
    requests.push(request);
    const answer = await reply(request);
    const status = answer.status ?? 200;
    return new Response(JSON.stringify(answer.body ?? {}), {
      status,
      statusText: answer.statusText ?? (status === 200 ? 'OK' : 'Error'),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  return {
    requests,
    restore(): void {
      globalThis.fetch = original;
    },
  };
}
