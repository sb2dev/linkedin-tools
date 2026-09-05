import { ApiError, type ProblemDetails } from '@/types/api';

const BASE_URL = '/api';

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Registered once by the auth store so an expired token is dropped wherever it is noticed. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  /** A string is appended verbatim, for callers that encode it themselves. */
  params?: URLSearchParams | string;
  /** Serialised as JSON. Takes precedence over body when both are given. */
  json?: unknown;
  /** Sent untouched, so the browser sets the multipart boundary itself. */
  body?: FormData;
  /** Attach the bearer token. Requests marked required fail fast when signed out. */
  auth?: 'required' | 'optional' | 'none';
  signal?: AbortSignal;
}

export function problemFrom(status: number, title: string, detail?: string): ProblemDetails {
  return { type: 'about:blank', title, status, detail };
}

/** Reads a parsed body as a problem document, filling anything it omits from the response itself. */
export function problemFromJson(payload: unknown, status: number, fallbackTitle: string): ProblemDetails {
  const fallback = problemFrom(status, fallbackTitle);
  if (payload === null || typeof payload !== 'object') return fallback;
  const candidate = payload as Partial<ProblemDetails>;
  return {
    type: candidate.type ?? fallback.type,
    title: candidate.title ?? fallback.title,
    status: typeof candidate.status === 'number' ? candidate.status : status,
    detail: candidate.detail,
    instance: candidate.instance,
    errors: candidate.errors,
  };
}

async function readProblem(response: Response): Promise<ProblemDetails> {
  const title = response.statusText.length > 0 ? response.statusText : 'Request failed';
  try {
    return problemFromJson(await response.json(), response.status, title);
  } catch {
    return problemFrom(response.status, title);
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', params, json, body, auth = 'none', signal } = options;

  if (auth === 'required' && accessToken === null) {
    throw new ApiError(problemFrom(401, 'Not signed in', 'Sign in to perform this action.'));
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (auth !== 'none' && accessToken !== null) headers.Authorization = `Bearer ${accessToken}`;

  const search = typeof params === 'string' ? params : (params?.toString() ?? '');
  const url = `${BASE_URL}${path}${search.length > 0 ? `?${search}` : ''}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: json !== undefined ? JSON.stringify(json) : body,
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new ApiError(
      problemFrom(0, 'Cannot reach the API', 'The server did not respond. Check that the backend is running.'),
    );
  }

  // A rejected token is worthless: drop it here first, so nothing retries with it.
  if (response.status === 401) {
    setAccessToken(null);
    onUnauthorized?.();
  }

  if (!response.ok) {
    throw new ApiError(await readProblem(response));
  }

  // A misrouted /api (an SPA fallback, a proxy error page) answers 200 with HTML.
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(
      problemFrom(response.status, 'Unreadable response', 'The API answered with something that is not JSON.'),
    );
  }
}

export const api = {
  get: <T>(path: string, options: Omit<RequestOptions, 'method' | 'json' | 'body'> = {}): Promise<T> =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, options: Omit<RequestOptions, 'method'> = {}): Promise<T> =>
    request<T>(path, { ...options, method: 'POST' }),
};
