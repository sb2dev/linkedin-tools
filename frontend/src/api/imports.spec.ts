import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commitImport, getRowSource, login } from '@/api/imports';
import { setAccessToken } from '@/api/client';
import { ApiError } from '@/types/api';
import { fakeFetch, jsonResponse, problemResponse } from '@/test';

function install(reply: Parameters<typeof fakeFetch>[0]): ReturnType<typeof fakeFetch> {
  const fake = fakeFetch(reply);
  vi.stubGlobal('fetch', fake.fetch);
  return fake;
}

beforeEach(() => {
  setAccessToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe('login', () => {
  it('posts the credentials as JSON', async () => {
    const fake = install(() => jsonResponse({ accessToken: 't', expiresIn: 3600, username: 'admin' }));

    await login('admin', 'admin');

    expect(fake.lastRequest.url).toBe('/api/auth/login');
    expect(fake.lastRequest.method).toBe('POST');
    expect(fake.lastRequest.body).toBe('{"username":"admin","password":"admin"}');
  });

  it('returns the session the API grants', async () => {
    install(() => jsonResponse({ accessToken: 'token-1', expiresIn: 3600, username: 'admin' }));

    await expect(login('admin', 'admin')).resolves.toEqual({
      accessToken: 'token-1',
      expiresIn: 3600,
      username: 'admin',
    });
  });

  it('does not send a stale token with the credentials', async () => {
    setAccessToken('stale');
    const fake = install(() => jsonResponse({ accessToken: 't', expiresIn: 1, username: 'admin' }));

    await login('admin', 'admin');

    expect(fake.lastRequest.headers.Authorization).toBeUndefined();
  });

  it('reports a rejected password as an ApiError carrying the reason', async () => {
    install(() =>
      problemResponse(401, { title: 'Unauthorized', status: 401, detail: 'Wrong username or password.' }, 'Unauthorized'),
    );

    const error = (await login('admin', 'nope').catch((cause: unknown) => cause)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.message).toBe('Wrong username or password.');
  });

  it('keeps the password out of the URL', async () => {
    const fake = install(() => jsonResponse({ accessToken: 't', expiresIn: 1, username: 'admin' }));

    await login('admin', 'hunter2');

    expect(fake.lastRequest.url).not.toContain('hunter2');
  });
});

describe('commitImport', () => {

  it.each([
    ['the off position of the toggle rather than omitting it', false],
    ['the on position, so the realignment the reader asked for is applied', true],
  ])('sends %s', async (_label, repair) => {
    setAccessToken('token-1');
    const fake = install(() => jsonResponse({ importId: 'imp-1', committed: {} }));

    await commitImport('imp-1', repair);

    expect(fake.lastRequest.body).toBe(JSON.stringify({ repair }));
  });

  it('escapes an import id that carries URL punctuation', async () => {
    setAccessToken('token-1');
    const fake = install(() => jsonResponse({ importId: 'a/b', committed: {} }));

    await commitImport('a/b', false);

    expect(fake.lastRequest.url).toBe('/api/imports/a%2Fb/commit');
  });

  it('sends the token, since committing needs a session', async () => {
    setAccessToken('token-1');
    const fake = install(() => jsonResponse({ importId: 'imp-1', committed: {} }));

    await commitImport('imp-1', false);

    expect(fake.lastRequest.headers.Authorization).toBe('Bearer token-1');
  });

  it('refuses to commit while signed out instead of sending an anonymous request', async () => {
    const fake = install(() => jsonResponse({}));

    const error = (await commitImport('imp-1', false).catch((cause: unknown) => cause)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.isUnauthorized).toBe(true);
    expect(fake.callCount).toBe(0);
  });

  it('returns what was written, including the failures the index reported', async () => {
    setAccessToken('token-1');
    const result = {
      importId: 'imp-1',
      committed: { profilesInserted: 265, profilesUpdated: 0, indexed: 265, indexFailures: [] },
    };
    install(() => jsonResponse(result));

    await expect(commitImport('imp-1', false)).resolves.toEqual(result);
  });
});

describe('getRowSource', () => {
  const source = {
    importId: 'imp-1',
    filename: '300 user linkedin.csv',
    line: {
      lineNumber: 120,
      raw: 'tim martin,tim,martin,male',
      rawTruncated: false,
      fieldCount: 77,
      expectedFieldCount: 77,
      recovered: false,
      droppedFields: [],
      accepted: true,
      scrambled: false,
      columns: [
        { index: 0, column: 'full_name', target: 'person.fullName', value: 'tim martin', verdict: 'kept' },
      ],
    },
  };

  it('asks for the line under the import it belongs to', async () => {
    setAccessToken('token-1');
    const fake = install(() => jsonResponse(source));

    await getRowSource('imp-1', 120);

    expect(fake.lastRequest.url).toBe('/api/imports/imp-1/rows/120');
    expect(fake.lastRequest.method).toBe('GET');
  });

  it('escapes an import id that carries URL punctuation', async () => {
    setAccessToken('token-1');
    const fake = install(() => jsonResponse(source));

    await getRowSource('a/b', 7);

    expect(fake.lastRequest.url).toBe('/api/imports/a%2Fb/rows/7');
  });

  it('sends the token, since the raw line is the uploaded file itself', async () => {
    setAccessToken('token-1');
    const fake = install(() => jsonResponse(source));

    await getRowSource('imp-1', 120);

    expect(fake.lastRequest.headers.Authorization).toBe('Bearer token-1');
  });

  it('refuses to ask for it while signed out', async () => {
    const fake = install(() => jsonResponse(source));

    const error = (await getRowSource('imp-1', 120).catch((cause: unknown) => cause)) as ApiError;

    expect(error.isUnauthorized).toBe(true);
    expect(fake.callCount).toBe(0);
  });

  it('returns the line and the cells the reader made of it', async () => {
    setAccessToken('token-1');
    install(() => jsonResponse(source));

    await expect(getRowSource('imp-1', 120)).resolves.toEqual(source);
  });

  it('passes the abort signal of the caller through to fetch', async () => {
    setAccessToken('token-1');
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const fake = fakeFetch(() => jsonResponse(source));
    vi.stubGlobal('fetch', ((input: RequestInfo | URL, init?: RequestInit) => {
      seen = init?.signal ?? undefined;
      return fake.fetch(input, init);
    }));

    await getRowSource('imp-1', 120, controller.signal);

    expect(seen).toBe(controller.signal);
  });
});
