/** Import needs a token, so a missing one shows a sign-in form rather than a dead error. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setAccessToken } from '@/api/client';
import { useAuthStore } from '@/hooks/use-auth';
import { fakeFetch, jsonResponse, problemResponse, renderApp } from '@/test';
import { LoginPrompt } from './LoginPrompt';

function install(reply: Parameters<typeof fakeFetch>[0]): ReturnType<typeof fakeFetch> {
  const fake = fakeFetch(reply);
  vi.stubGlobal('fetch', fake.fetch);
  return fake;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
  // act, because the store is outside React: a bare write to it while a component is still
  // mounted is a state update React never saw, which it reports as an update not wrapped in act().
  act(() => {
    useAuthStore.setState({ token: null, username: null, error: null, pending: false });
  });
});

describe('LoginPrompt', () => {
  it('asks for the operator credentials', () => {
    renderApp(<LoginPrompt />);

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('signs in and keeps the token', async () => {
    install(() => jsonResponse({ accessToken: 'token-1', expiresIn: 3600, username: 'admin' }));
    renderApp(<LoginPrompt />);

    await userEvent.type(screen.getByLabelText(/username/i), 'admin');
    await userEvent.type(screen.getByLabelText(/password/i), 'admin');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByLabelText(/username/i)).toBeInTheDocument();
    expect(useAuthStore.getState().token).toBe('token-1');
  });

  it('shows why a refused sign-in was refused', async () => {
    install(() =>
      problemResponse(401, { title: 'Unauthorized', status: 401, detail: 'Invalid username or password' }),
    );
    renderApp(<LoginPrompt />);

    await userEvent.type(screen.getByLabelText(/username/i), 'admin');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/Invalid username or password/)).toBeInTheDocument();
  });

  it('clears the failure as soon as the reader edits a field again', async () => {
    install(() => problemResponse(401, { title: 'Unauthorized', status: 401, detail: 'nope' }));
    renderApp(<LoginPrompt />);

    await userEvent.type(screen.getByLabelText(/username/i), 'admin');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await screen.findByText('nope');

    await userEvent.type(screen.getByLabelText(/password/i), 'x');

    expect(screen.queryByText('nope')).not.toBeInTheDocument();
  });
});
