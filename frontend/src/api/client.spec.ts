import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  getAccessToken,
  problemFromJson,
  request,
  setAccessToken,
  setUnauthorizedHandler,
} from '@/api/client';
import { ApiError } from '@/types/api';
import { fakeFetch, jsonResponse, problemResponse, textResponse } from '@/test';

interface Schema {
  fields: string[];
}

beforeEach(() => {
  setAccessToken(null);
  setUnauthorizedHandler(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
  setUnauthorizedHandler(null);
});

function install(reply: Parameters<typeof fakeFetch>[0]): ReturnType<typeof fakeFetch> {
  const fake = fakeFetch(reply);
  vi.stubGlobal('fetch', fake.fetch);
  return fake;
}

describe('a successful request', () => {
  it('returns the parsed body', async () => {
    install(() => jsonResponse({ fields: ['skills'] }));

    await expect(api.get<Schema>('/search/schema')).resolves.toEqual({ fields: ['skills'] });
  });

  it('asks for JSON under the API prefix', async () => {
    const fake = install(() => jsonResponse({}));

    await api.get('/search/schema');

    expect(fake.lastRequest.url).toBe('/api/search/schema');
    expect(fake.lastRequest.method).toBe('GET');
    expect(fake.lastRequest.headers.Accept).toBe('application/json');
  });

  it('appends a query string the caller built, without re-escaping it', async () => {
    const fake = install(() => jsonResponse({}));

    await api.get('/search', { params: 'q=head+of+growth&f.skills=leadership,training' });

    expect(fake.lastRequest.url).toBe('/api/search?q=head+of+growth&f.skills=leadership,training');
  });

  it('appends URLSearchParams for callers that do not encode by hand', async () => {
    const fake = install(() => jsonResponse({}));

    await api.get('/search/suggest', { params: new URLSearchParams({ field: 'skills', q: 'lead er' }) });

    expect(fake.lastRequest.search).toBe('field=skills&q=lead+er');
  });

  it('leaves the question mark off when there are no parameters', async () => {
    const fake = install(() => jsonResponse({}));

    await api.get('/search', { params: '' });

    expect(fake.lastRequest.url).toBe('/api/search');
  });

  it('sends a JSON body with its content type', async () => {
    const fake = install(() => jsonResponse({}));

    await api.post('/auth/login', { json: { username: 'admin', password: 'secret' } });

    expect(fake.lastRequest.method).toBe('POST');
    expect(fake.lastRequest.headers['Content-Type']).toBe('application/json');
    expect(fake.lastRequest.body).toBe('{"username":"admin","password":"secret"}');
  });

  it('sends form data untouched so the browser sets the multipart boundary', async () => {
    const fake = install(() => jsonResponse({}));
    const form = new FormData();
    form.set('file', new Blob(['a,b']), 'export.csv');

    await api.post('/imports', { body: form });

    expect(fake.lastRequest.body).toBe(form);
    expect(fake.lastRequest.headers['Content-Type']).toBeUndefined();
  });
});

describe('the bearer token', () => {
  it('is left off a request that does not ask for it', async () => {
    setAccessToken('token-1');
    const fake = install(() => jsonResponse({}));

    await api.get('/search');

    expect(fake.lastRequest.headers.Authorization).toBeUndefined();
  });

  it('is attached when the caller asks and a token is held', async () => {
    setAccessToken('token-1');
    const fake = install(() => jsonResponse({}));

    await api.get('/profiles/jane', { auth: 'optional' });

    expect(fake.lastRequest.headers.Authorization).toBe('Bearer token-1');
  });

  it('is simply absent for an optional request while signed out', async () => {
    const fake = install(() => jsonResponse({}));

    await api.get('/profiles/jane', { auth: 'optional' });

    expect(fake.callCount).toBe(1);
    expect(fake.lastRequest.headers.Authorization).toBeUndefined();
  });

  it('stops a request that requires it before anything is sent', async () => {
    const fake = install(() => jsonResponse({}));

    const failure = await api.post('/imports/1/commit', { auth: 'required' }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(401);
    expect(fake.callCount).toBe(0);
  });

  it('is never written to storage', async () => {
    setAccessToken('token-1');
    install(() => jsonResponse({}));

    await api.get('/search');

    expect(getAccessToken()).toBe('token-1');
    expect(window.localStorage.getItem('token')).toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('a failed request', () => {
  it('carries the status, title, detail and field errors of a problem document', async () => {
    install(() =>
      problemResponse(400, {
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'The lower bound 15 is above the upper bound 5',
        errors: { 'f.yearsExperience': ['The lower bound 15 is above the upper bound 5'] },
      }),
    );

    const error = await api.get('/search').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    const problem = error as ApiError;
    expect(problem.status).toBe(400);
    expect(problem.title).toBe('Bad Request');
    expect(problem.message).toBe('The lower bound 15 is above the upper bound 5');
    expect(problem.fieldErrors).toEqual({
      'f.yearsExperience': ['The lower bound 15 is above the upper bound 5'],
    });
  });

  it('falls back to the status line when the body is not JSON', async () => {
    install(() => textResponse(502, '<html>Bad gateway</html>', 'Bad Gateway'));

    const error = (await api.get('/search').catch((cause: unknown) => cause)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.title).toBe('Bad Gateway');
    expect(error.fieldErrors).toEqual({});
  });

  it('survives an error with no body at all', async () => {
    install(() => new Response(null, { status: 500, statusText: 'Internal Server Error' }));

    const error = (await api.get('/search').catch((cause: unknown) => cause)) as ApiError;

    expect(error.status).toBe(500);
    expect(error.title).toBe('Internal Server Error');
  });

  it('survives an error whose JSON body is not a problem document', async () => {
    install(() => new Response('[1,2,3]', { status: 503, statusText: 'Service Unavailable' }));

    const error = (await api.get('/search').catch((cause: unknown) => cause)) as ApiError;

    expect(error.status).toBe(503);
    expect(error.title).toBe('Service Unavailable');
  });

  it('names the failure when even the status line is empty', async () => {
    install(() => new Response('nope', { status: 418, statusText: '' }));

    const error = (await api.get('/search').catch((cause: unknown) => cause)) as ApiError;

    expect(error.title).toBe('Request failed');
    expect(error.status).toBe(418);
  });

  it('reports a transport failure as offline rather than leaking the fetch error', async () => {
    install(() => {
      throw new TypeError('Failed to fetch');
    });

    const error = (await api.get('/search').catch((cause: unknown) => cause)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.isOffline).toBe(true);
  });

  it('rejects with an ApiError when a 200 body cannot be read as JSON', async () => {
    // A misrouted /api returns the index page with status 200; callers only handle ApiError.
    install(() => new Response('<!doctype html>', { status: 200 }));

    const error = (await api.get('/search').catch((cause: unknown) => cause)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.title).toBe('Unreadable response');
    expect(error.status).toBe(200);
  });

  it('lets an abort through untouched, so a cancelled search is not shown as an error', async () => {
    const controller = new AbortController();
    install(() => {
      controller.abort();
      throw new DOMException('The operation was aborted.', 'AbortError');
    });

    const error = (await request('/search', { signal: controller.signal }).catch(
      (cause: unknown) => cause,
    )) as Error;

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error.name).toBe('AbortError');
  });
});

describe('a 401', () => {
  it('drops the token so nothing retries with it', async () => {
    setAccessToken('expired');
    install(() => problemResponse(401, { title: 'Unauthorized', status: 401 }, 'Unauthorized'));

    await api.get('/profiles/jane', { auth: 'optional' }).catch(() => undefined);

    expect(getAccessToken()).toBeNull();
  });

  it('tells the session it has ended', async () => {
    const ended = vi.fn();
    setUnauthorizedHandler(ended);
    setAccessToken('expired');
    install(() => problemResponse(401, { title: 'Unauthorized', status: 401 }, 'Unauthorized'));

    const error = (await api.get('/imports', { auth: 'optional' }).catch((cause: unknown) => cause)) as ApiError;

    expect(ended).toHaveBeenCalledTimes(1);
    expect(error.isUnauthorized).toBe(true);
  });

  it('does not crash when no session is listening', async () => {
    install(() => problemResponse(401, { title: 'Unauthorized', status: 401 }, 'Unauthorized'));

    await expect(api.get('/imports')).rejects.toBeInstanceOf(ApiError);
  });

  it('leaves the next request unauthenticated', async () => {
    setAccessToken('expired');
    const fake = install((sent) =>
      sent.url.includes('first')
        ? problemResponse(401, { title: 'Unauthorized', status: 401 }, 'Unauthorized')
        : jsonResponse({}),
    );

    await api.get('/first', { auth: 'optional' }).catch(() => undefined);
    await api.get('/second', { auth: 'optional' });

    expect(fake.requests[1].headers.Authorization).toBeUndefined();
  });
});

describe('problemFromJson', () => {
  it('fills in what the server left out', () => {
    expect(problemFromJson({ detail: 'no' }, 404, 'Not Found')).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'no',
      instance: undefined,
      errors: undefined,
    });
  });

  it('trusts the response status over a body that disagrees about its type', () => {
    expect(problemFromJson({ status: 'oops' }, 500, 'Server Error').status).toBe(500);
  });

  it('falls back completely for a body that is not an object', () => {
    expect(problemFromJson('nope', 500, 'Server Error')).toEqual({
      type: 'about:blank',
      title: 'Server Error',
      status: 500,
      detail: undefined,
    });
    expect(problemFromJson(null, 500, 'Server Error').title).toBe('Server Error');
  });
});
