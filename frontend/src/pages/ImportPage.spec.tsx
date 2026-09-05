import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { ImportPage } from './ImportPage';
import { setAccessToken } from '@/api/client';
import { useAuthStore } from '@/hooks/use-auth';
import { type FetchStub, renderApp, stubFetch } from '@/test';

let network: FetchStub | undefined;

beforeEach(() => {
  useAuthStore.setState({ token: null, username: null, pending: false, error: null });
});

afterEach(() => {
  network?.restore();
  network = undefined;
  setAccessToken(null);
});

/** The page reads the corpus as soon as it has a token, for the section that offers to delete it. */
function signedIn(): void {
  network = stubFetch(() => ({ body: { profiles: 265 } }));
  setAccessToken('header.payload.signature');
  useAuthStore.setState({ token: 'header.payload.signature', username: 'admin' });
}

describe('ImportPage', () => {
  it('says what the page does and promises nothing is written before the confirm step', () => {
    renderApp(<ImportPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Import profiles' })).toBeInTheDocument();
    expect(screen.getByText(/Nothing is written until you confirm/)).toBeInTheDocument();
  });

  it('offers the way back to the search it interrupted', () => {
    renderApp(<ImportPage />);

    expect(screen.getByRole('link', { name: 'Back to search' })).toHaveAttribute('href', '/');
  });

  it('asks for a sign in before it offers a file chooser', () => {
    renderApp(<ImportPage />);

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose a file' })).not.toBeInTheDocument();
  });

  it('offers the file chooser to a reader who is already signed in', () => {
    signedIn();

    renderApp(<ImportPage />);

    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeInTheDocument();
  });

  it('offers the operator a way to empty the corpus, below the import flow', async () => {
    signedIn();

    renderApp(<ImportPage />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Delete imported data' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Delete all 265 profiles' })).toBeInTheDocument();
  });

  it('keeps the delete out of the page entirely for a reader who is not signed in', () => {
    renderApp(<ImportPage />);

    expect(screen.queryByText('Delete imported data')).not.toBeInTheDocument();
  });
});
