import { useState } from 'react';
import type { FormEvent, JSX } from 'react';
import clsx from 'clsx';
import { useAuth } from '@/hooks/use-auth';
import { cardClass, focusRing, inputClass } from '@/components/layout';

export interface LoginPromptProps {
  /** Explains why the form appeared, for example after a token expired mid-import. */
  reason?: string;
}

/** Signing in happens inline, so a missing token never turns into a dead 401. */
export function LoginPrompt({ reason }: LoginPromptProps): JSX.Element {
  const { signIn, pending, error, clearError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void signIn(username.trim(), password);
  }

  return (
    <form onSubmit={onSubmit} className={clsx(cardClass, 'max-w-sm p-4')}>
      <h2 className="text-sm font-medium">Sign in to import</h2>
      <p className="mt-1 text-xs text-muted">
        {reason ?? 'Importing writes to the database, so it needs an account. The demo credentials are in the README.'}
      </p>

      <label className="mt-3 block text-xs text-muted">
        Username
        <input
          type="text"
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
            clearError();
          }}
          autoComplete="username"
          required
          className={clsx('mt-0.5', inputClass)}
        />
      </label>

      <label className="mt-2 block text-xs text-muted">
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            clearError();
          }}
          autoComplete="current-password"
          required
          className={clsx('mt-0.5', inputClass)}
        />
      </label>

      {error !== null && <p className="mt-2 text-xs text-negative">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className={clsx(
          'mt-3 w-full rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50',
          focusRing,
        )}
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
