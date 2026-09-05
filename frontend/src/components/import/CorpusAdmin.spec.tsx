/**
 * The one control that destroys data. It has to say what it will delete before it will do it, hold
 * the operator to an exact phrase, and be honest when the corpus emptied but the index did not.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PURGE_CONFIRMATION } from '@/api/admin';
import { setAccessToken } from '@/api/client';
import { useAuthStore } from '@/hooks/use-auth';
import { fakeFetch, jsonResponse, problemResponse, renderApp } from '@/test';
import { CorpusAdmin } from './CorpusAdmin';

const LAST_IMPORT = {
  importId: 'run-1',
  filename: '300 user linkedin.csv',
  committedAt: '2026-09-01T10:05:00.000Z',
  rowsAccepted: 302,
  profilesNew: 265,
  profilesUpdated: 0,
};

function install(reply: Parameters<typeof fakeFetch>[0]): ReturnType<typeof fakeFetch> {
  const fake = fakeFetch(reply);
  vi.stubGlobal('fetch', fake.fetch);
  return fake;
}

function signedIn(): void {
  setAccessToken('a-token');
  useAuthStore.setState({ token: 'a-token', username: 'admin', error: null, pending: false });
}

beforeEach(() => {
  signedIn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
  // act, because the store is outside React: a bare write to it while a component is still
  // mounted is a state update React never saw, which it reports as an update not wrapped in act().
  act(() => {
    useAuthStore.setState({ token: null, username: null, error: null, pending: false });
  });
});

/** Serves the corpus status, and whatever the purge should answer. */
function serve(profiles: number, purgeReply?: () => Response): ReturnType<typeof fakeFetch> {
  return install((request) => {
    if (request.url.includes('/purge')) {
      return purgeReply
        ? purgeReply()
        : jsonResponse({ profilesDeleted: profiles, indexCleared: true, importHistoryRetained: true });
    }
    return jsonResponse({ profiles, lastImport: profiles > 0 ? LAST_IMPORT : undefined });
  });
}

async function arm(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: /^Delete all/ }));
}

describe('CorpusAdmin', () => {
  it('shows nothing at all to a signed-out reader', () => {
    setAccessToken(null);
    useAuthStore.setState({ token: null, username: null, error: null, pending: false });
    serve(5);

    const { container } = renderApp(<CorpusAdmin />);

    expect(container).toBeEmptyDOMElement();
  });

  it('says it is reading before the count arrives', () => {
    serve(5);
    renderApp(<CorpusAdmin />);

    expect(screen.getByText('Reading the corpus…')).toBeInTheDocument();
  });

  it('names what is stored and which file put it there', async () => {
    serve(265);
    renderApp(<CorpusAdmin />);

    expect(await screen.findByText('265')).toBeInTheDocument();
    expect(screen.getByText(/300 user linkedin\.csv/)).toBeInTheDocument();
    expect(screen.getByText(/302 rows accepted/)).toBeInTheDocument();
  });

  it('says so when nothing has ever been committed', async () => {
    install(() => jsonResponse({ profiles: 4 }));
    renderApp(<CorpusAdmin />);

    expect(await screen.findByText('Nothing has been committed yet.')).toBeInTheDocument();
  });

  it('offers no delete when the corpus is already empty', async () => {
    serve(0);
    renderApp(<CorpusAdmin />);

    expect(await screen.findByText('There is nothing to delete.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete all/ })).not.toBeInTheDocument();
  });

  it('reports a corpus it could not read at all', async () => {
    install(() => problemResponse(503, { title: 'Service unavailable', status: 503, detail: 'the database is down' }));
    renderApp(<CorpusAdmin />);

    expect(await screen.findByText(/The corpus could not be read/)).toBeInTheDocument();
  });

  describe('the confirmation', () => {
    it('keeps the delete disabled until the phrase is exact', async () => {
      serve(265);
      renderApp(<CorpusAdmin />);
      await arm();

      const confirm = screen.getByRole('button', { name: 'Delete 265 profiles' });
      expect(confirm).toBeDisabled();

      await userEvent.type(screen.getByLabelText(/Type/), 'delete all profiles');
      expect(confirm).toBeDisabled();

      await userEvent.clear(screen.getByLabelText(/Type/));
      await userEvent.type(screen.getByLabelText(/Type/), PURGE_CONFIRMATION);
      expect(confirm).toBeEnabled();
    });

    it('names the number it is about to delete, in the label and on the button', async () => {
      serve(265);
      renderApp(<CorpusAdmin />);
      await arm();

      expect(screen.getByText(/This deletes 265 profiles/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete 265 profiles' })).toBeInTheDocument();
    });

    it('goes back to the armed state on cancel, forgetting what was typed', async () => {
      serve(265);
      renderApp(<CorpusAdmin />);
      await arm();
      await userEvent.type(screen.getByLabelText(/Type/), PURGE_CONFIRMATION);

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByLabelText(/Type/)).not.toBeInTheDocument();
      await arm();
      expect(screen.getByLabelText(/Type/)).toHaveValue('');
    });
  });

  describe('after the purge', () => {
    it('reports what was removed and that both stores are empty', async () => {
      serve(265);
      renderApp(<CorpusAdmin />);
      await arm();
      await userEvent.type(screen.getByLabelText(/Type/), PURGE_CONFIRMATION);
      await userEvent.click(screen.getByRole('button', { name: 'Delete 265 profiles' }));

      expect(await screen.findByText(/Removed 265 profiles/)).toBeInTheDocument();
      expect(screen.getByText(/are both empty/)).toBeInTheDocument();
    });

    it('warns when the profiles are gone but the index is not, and says why', async () => {
      serve(265, () =>
        jsonResponse({
          profilesDeleted: 265,
          indexCleared: false,
          indexError: 'connect ECONNREFUSED',
          importHistoryRetained: true,
        }),
      );
      renderApp(<CorpusAdmin />);
      await arm();
      await userEvent.type(screen.getByLabelText(/Type/), PURGE_CONFIRMATION);
      await userEvent.click(screen.getByRole('button', { name: 'Delete 265 profiles' }));

      expect(await screen.findByText('The profiles are gone, the search index is not.')).toBeInTheDocument();
      expect(screen.getByText(/connect ECONNREFUSED/)).toBeInTheDocument();
    });

    it('falls back to a plain reason when the API named none', async () => {
      serve(265, () =>
        jsonResponse({ profilesDeleted: 265, indexCleared: false, importHistoryRetained: true }),
      );
      renderApp(<CorpusAdmin />);
      await arm();
      await userEvent.type(screen.getByLabelText(/Type/), PURGE_CONFIRMATION);
      await userEvent.click(screen.getByRole('button', { name: 'Delete 265 profiles' }));

      expect(await screen.findByText(/The search engine did not answer/)).toBeInTheDocument();
    });

    it('shows the reason a refused purge gives, and keeps the form open', async () => {
      serve(265, () =>
        problemResponse(400, { title: 'Bad request', status: 400, detail: 'the confirmation phrase was wrong' }),
      );
      renderApp(<CorpusAdmin />);
      await arm();
      await userEvent.type(screen.getByLabelText(/Type/), PURGE_CONFIRMATION);
      await userEvent.click(screen.getByRole('button', { name: 'Delete 265 profiles' }));

      expect(await screen.findByText('the confirmation phrase was wrong')).toBeInTheDocument();
      expect(screen.getByLabelText(/Type/)).toBeInTheDocument();
    });

    it('disables the controls while the delete is in flight', async () => {
      let release: (value: Response) => void = () => undefined;
      install((request) => {
        if (request.url.includes('/purge')) {
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        }
        return jsonResponse({ profiles: 265, lastImport: LAST_IMPORT });
      });
      renderApp(<CorpusAdmin />);
      await arm();
      await userEvent.type(screen.getByLabelText(/Type/), PURGE_CONFIRMATION);
      await userEvent.click(screen.getByRole('button', { name: 'Delete 265 profiles' }));

      expect(await screen.findByRole('button', { name: 'Deleting…' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(screen.getByLabelText(/Type/)).toBeDisabled();

      release(jsonResponse({ profilesDeleted: 265, indexCleared: true, importHistoryRetained: true }));
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Deleting…' })).not.toBeInTheDocument();
      });
    });
  });
});
