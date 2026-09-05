import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore, useIsAuthenticated } from '@/hooks/use-auth';
import { api, getAccessToken, setAccessToken } from '@/api/client';
import { fakeFetch, jsonResponse, problemResponse } from '@/test';

const forced = vi.hoisted(() => ({ loginRejectsWith: undefined as Error | undefined }));

vi.mock('@/api/imports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/imports')>();
  return {
    ...actual,
    login: (username: string, password: string) =>
      forced.loginRejectsWith === undefined
        ? actual.login(username, password)
        : Promise.reject(forced.loginRejectsWith),
  };
});

function install(reply: Parameters<typeof fakeFetch>[0]): ReturnType<typeof fakeFetch> {
  const fake = fakeFetch(reply);
  vi.stubGlobal('fetch', fake.fetch);
  return fake;
}

const session = { accessToken: 'token-1', expiresIn: 3600, username: 'admin' };

beforeEach(() => {
  forced.loginRejectsWith = undefined;
  useAuthStore.setState({ token: null, username: null, pending: false, error: null });
  setAccessToken(null);
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('signing in', () => {
  it('holds the session it was granted', async () => {
    install(() => jsonResponse(session));

    await expect(useAuthStore.getState().signIn('admin', 'admin')).resolves.toBe(true);

    expect(useAuthStore.getState().token).toBe('token-1');
    expect(useAuthStore.getState().username).toBe('admin');
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('hands the token to the API client so the next request carries it', async () => {
    install(() => jsonResponse(session));

    await useAuthStore.getState().signIn('admin', 'admin');

    expect(getAccessToken()).toBe('token-1');
  });

  it('keeps the token in this tab only, out of localStorage and out of cookies', async () => {
    install(() => jsonResponse(session));

    await useAuthStore.getState().signIn('admin', 'admin');

    expect(window.sessionStorage.getItem('profile-search.session')).toContain('token-1');
    expect(window.localStorage.length).toBe(0);
    expect(document.cookie).not.toContain('token-1');
    expect(JSON.stringify(window.localStorage)).not.toContain('token-1');
  });

  it('reports why a rejected sign-in failed', async () => {
    install(() =>
      problemResponse(401, { title: 'Unauthorized', status: 401, detail: 'Wrong username or password.' }, 'Unauthorized'),
    );

    await expect(useAuthStore.getState().signIn('admin', 'nope')).resolves.toBe(false);

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().error).toBe('Wrong username or password.');
    expect(getAccessToken()).toBeNull();
  });

  it('does not leave a stale token behind when a later sign-in fails', async () => {
    install((request) =>
      request.body === '{"username":"admin","password":"admin"}'
        ? jsonResponse(session)
        : problemResponse(401, { title: 'Unauthorized', status: 401, detail: 'no' }, 'Unauthorized'),
    );

    await useAuthStore.getState().signIn('admin', 'admin');
    await useAuthStore.getState().signIn('admin', 'wrong');

    expect(useAuthStore.getState().token).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('reports an unreachable API without pretending it was the password', async () => {
    install(() => {
      throw new TypeError('Failed to fetch');
    });

    await useAuthStore.getState().signIn('admin', 'admin');

    expect(useAuthStore.getState().error).toBe(
      'The server did not respond. Check that the backend is running.',
    );
  });

  it('does not put an internal failure in front of the reader as if it were a password problem', async () => {
    forced.loginRejectsWith = new TypeError("cannot read 'accessToken' of undefined");

    await expect(useAuthStore.getState().signIn('admin', 'admin')).resolves.toBe(false);

    expect(useAuthStore.getState().error).toBe('Sign in failed.');
    expect(useAuthStore.getState().token).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('marks itself pending only while the request is in flight', async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    install(async () => {
      await held;
      return jsonResponse(session);
    });

    const signingIn = useAuthStore.getState().signIn('admin', 'admin');
    expect(useAuthStore.getState().pending).toBe(true);

    release?.();
    await signingIn;
    expect(useAuthStore.getState().pending).toBe(false);
  });

  it('clears the previous error when a new attempt starts', async () => {
    useAuthStore.setState({ error: 'Wrong username or password.' });
    install(() => jsonResponse(session));

    await useAuthStore.getState().signIn('admin', 'admin');

    expect(useAuthStore.getState().error).toBeNull();
  });
});

describe('signing out', () => {
  it('forgets the session in the store and in the API client', async () => {
    install(() => jsonResponse(session));
    await useAuthStore.getState().signIn('admin', 'admin');

    useAuthStore.getState().signOut();

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().username).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('is harmless when nobody is signed in', () => {
    expect(() => {
      useAuthStore.getState().signOut();
    }).not.toThrow();
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('clears a stale error so the sign-in form opens clean', () => {
    useAuthStore.setState({ error: 'Wrong username or password.' });

    useAuthStore.getState().signOut();

    expect(useAuthStore.getState().error).toBeNull();
  });
});

describe('a rejected token', () => {
  it('ends the session wherever the 401 was noticed', async () => {
    install(() => jsonResponse(session));
    await useAuthStore.getState().signIn('admin', 'admin');

    install(() => problemResponse(401, { title: 'Unauthorized', status: 401 }, 'Unauthorized'));
    await api.get('/imports', { auth: 'optional' }).catch(() => undefined);

    expect(useAuthStore.getState().token).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('leaves an anonymous session alone', async () => {
    install(() => problemResponse(401, { title: 'Unauthorized', status: 401 }, 'Unauthorized'));

    await api.get('/imports').catch(() => undefined);

    expect(useAuthStore.getState().token).toBeNull();
  });
});

describe('useIsAuthenticated', () => {
  it('follows the store as the session starts and ends', async () => {
    install(() => jsonResponse(session));
    const { result } = renderHook(() => useIsAuthenticated());

    expect(result.current).toBe(false);

    await act(async () => {
      await useAuthStore.getState().signIn('admin', 'admin');
    });
    expect(result.current).toBe(true);

    act(() => {
      useAuthStore.getState().signOut();
    });
    expect(result.current).toBe(false);
  });
});

describe('a session across a page reload', () => {
  it('keeps the operator signed in, because a refresh mid-import must not sign them out', async () => {
    install(() => jsonResponse(session));
    await act(async () => {
      await useAuthStore.getState().signIn('admin', 'admin');
    });

    const stored = sessionStorage.getItem('profile-search.session');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? '{}')).toEqual({ token: 'token-1', username: 'admin' });
  });

  it('forgets the session on sign out, so the next reload starts signed out', async () => {
    install(() => jsonResponse(session));
    await act(async () => {
      await useAuthStore.getState().signIn('admin', 'admin');
    });

    act(() => {
      useAuthStore.getState().signOut();
    });

    expect(sessionStorage.getItem('profile-search.session')).toBeNull();
  });

  it('forgets it when the credentials were refused', async () => {
    sessionStorage.setItem('profile-search.session', JSON.stringify({ token: 'old', username: 'admin' }));
    install(() => problemResponse(401, 'Invalid username or password'));

    await act(async () => {
      await useAuthStore.getState().signIn('admin', 'wrong');
    });

    expect(sessionStorage.getItem('profile-search.session')).toBeNull();
  });

  it('keeps the operator signed in even when storage refuses to hold the session', async () => {
    install(() => jsonResponse(session));
    const setItem = vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    await act(async () => {
      await useAuthStore.getState().signIn('admin', 'admin');
    });

    // Storage being unavailable costs the reload, not the session in front of the operator.
    expect(useAuthStore.getState().token).toBe('token-1');
    setItem.mockRestore();
  });
});

describe('restoring a session when the tab reloads', () => {
  async function boot(
    stored: string | null,
  ): Promise<{ token: string | null; username: string | null; handedToClient: string | null }> {
    sessionStorage.clear();
    if (stored !== null) sessionStorage.setItem('profile-search.session', stored);
    vi.resetModules();
    const auth = await import('@/hooks/use-auth');
    const client = await import('@/api/client');
    return {
      token: auth.useAuthStore.getState().token,
      username: auth.useAuthStore.getState().username,
      handedToClient: client.getAccessToken(),
    };
  }

  it('signs the operator back in from the session the tab kept', async () => {
    const restored = await boot(JSON.stringify({ token: 'token-1', username: 'admin' }));

    expect(restored.token).toBe('token-1');
    expect(restored.username).toBe('admin');
    // The token reaches the API client too, so the first request after a reload carries it.
    expect(restored.handedToClient).toBe('token-1');
  });

  it('starts signed out when the tab kept nothing', async () => {
    const restored = await boot(null);

    expect(restored.token).toBeNull();
    expect(restored.handedToClient).toBeNull();
  });

  it('starts signed out when the stored value is not a session', async () => {
    const restored = await boot('{"token":42,"username":"admin"}');

    expect(restored.token).toBeNull();
  });

  it('starts signed out rather than throwing when the stored value is not even JSON', async () => {
    // A hand-edited value, or one a crashed tab left half written.
    const restored = await boot('half-writ');

    expect(restored.token).toBeNull();
  });
});
