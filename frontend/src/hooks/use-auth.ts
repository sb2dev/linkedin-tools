import { create } from 'zustand';
import { setAccessToken, setUnauthorizedHandler } from '@/api/client';
import { login } from '@/api/imports';
import { ApiError } from '@/types/api';

interface AuthState {
  token: string | null;
  username: string | null;
  pending: boolean;
  error: string | null;
  signIn: (username: string, password: string) => Promise<boolean>;
  signOut: () => void;
  clearError: () => void;
}

const STORAGE_KEY = 'profile-search.session';

interface StoredSession {
  readonly token: string;
  readonly username: string;
}

/** sessionStorage, not localStorage, so the token dies with the tab. */
function readStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as StoredSession).token === 'string' &&
      typeof (parsed as StoredSession).username === 'string'
    ) {
      return parsed as StoredSession;
    }
    return null;
  } catch {
    // A private window, or a hand-edited value. Starting signed out is the safe answer.
    return null;
  }
}

function writeStoredSession(session: StoredSession | null): void {
  try {
    if (session === null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage being unavailable costs the reload, not the session.
  }
}

const restored = readStoredSession();
if (restored !== null) setAccessToken(restored.token);

export const useAuthStore = create<AuthState>((set) => ({
  token: restored?.token ?? null,
  username: restored?.username ?? null,
  pending: false,
  error: null,

  signIn: async (username: string, password: string): Promise<boolean> => {
    set({ pending: true, error: null });
    try {
      const session = await login(username, password);
      setAccessToken(session.accessToken);
      writeStoredSession({ token: session.accessToken, username: session.username });
      set({
        token: session.accessToken,
        username: session.username,
        pending: false,
        error: null,
      });
      return true;
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.message : 'Sign in failed.';
      setAccessToken(null);
      writeStoredSession(null);
      set({ token: null, username: null, pending: false, error: message });
      return false;
    }
  },

  signOut: (): void => {
    setAccessToken(null);
    writeStoredSession(null);
    set({ token: null, username: null, error: null });
  },

  clearError: (): void => {
    set({ error: null });
  },
}));

// A 401 means the token the server saw is no longer good, so the session ends wherever it was noticed.
setUnauthorizedHandler(() => {
  if (useAuthStore.getState().token !== null) useAuthStore.getState().signOut();
});

export type AuthSnapshot = AuthState;

/** Fields are selected one by one so the snapshot never re-renders consumers on unrelated changes. */
export function useAuth(): AuthSnapshot {
  const token = useAuthStore((state) => state.token);
  const username = useAuthStore((state) => state.username);
  const pending = useAuthStore((state) => state.pending);
  const error = useAuthStore((state) => state.error);
  const signIn = useAuthStore((state) => state.signIn);
  const signOut = useAuthStore((state) => state.signOut);
  const clearError = useAuthStore((state) => state.clearError);
  return { token, username, pending, error, signIn, signOut, clearError };
}

export function useIsAuthenticated(): boolean {
  return useAuthStore((state) => state.token !== null);
}
