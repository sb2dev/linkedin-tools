import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { ImportPanel } from './ImportPanel';
import { getAccessToken, setAccessToken } from '@/api/client';
import { useAuthStore } from '@/hooks/use-auth';
import { commitResult, createTestQueryClient, type FetchStub, importPreview, profile, renderApp, stubFetch, stubUploads, type UploadStub } from '@/test';

const EXPORT = new File(['full_name,first_name\n'], '300 user linkedin.csv', { type: 'text/plain' });

const EXPIRED = {
  type: 'about:blank',
  title: 'Unauthorized',
  status: 401,
  detail: 'The access token has expired.',
};

let uploads: UploadStub;
let network: FetchStub | undefined;

beforeEach(() => {
  uploads = stubUploads();
  setAccessToken('header.payload.signature');
  useAuthStore.setState({
    token: 'header.payload.signature',
    username: 'admin',
    pending: false,
    error: null,
  });
});

afterEach(() => {
  uploads.restore();
  network?.restore();
  network = undefined;
  setAccessToken(null);
});

/** The file input carries no label, so it is reached the way the dropzone spec reaches it. */
async function chooseFile(user: UserEvent, container: HTMLElement, file: File): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  await user.upload(input as HTMLInputElement, file);
  await waitFor(() => {
    expect(uploads.uploads.length).toBeGreaterThan(0);
  });
}

async function settle(work: () => void): Promise<void> {
  await act(async () => {
    work();
  });
}

describe('ImportPanel', () => {
  it('asks for a sign in before any file can be chosen', () => {
    setAccessToken(null);
    useAuthStore.setState({ token: null, username: null });

    renderApp(<ImportPanel />);

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose a file' })).not.toBeInTheDocument();
  });

  it('writes nothing until a preview has been produced and confirmed', async () => {
    network = stubFetch(() => ({ body: commitResult() }));
    const user = userEvent.setup();
    const { container } = renderApp(<ImportPanel />);

    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Import / })).not.toBeInTheDocument();

    await chooseFile(user, container, EXPORT);
    await settle(() => {
      uploads.last.succeed(importPreview());
    });

    expect(screen.getByRole('button', { name: 'Import 302 rows' })).toBeInTheDocument();
    expect(network.requests).toHaveLength(0);
  });

  it('sends the chosen file to the import endpoint under the reader\'s token', async () => {
    const user = userEvent.setup();
    const { container } = renderApp(<ImportPanel />);

    await chooseFile(user, container, EXPORT);

    expect(uploads.last.method).toBe('POST');
    expect(uploads.last.url).toBe('/api/imports');
    expect(uploads.last.file?.name).toBe('300 user linkedin.csv');
    expect(uploads.last.headers.Authorization).toBe('Bearer header.payload.signature');
  });

  it('reports how far the upload has got while the file is still going up', async () => {
    const user = userEvent.setup();
    const { container } = renderApp(<ImportPanel />);

    await chooseFile(user, container, EXPORT);
    await settle(() => {
      uploads.last.reportProgress(5_767_168, 11_534_336);
    });

    expect(screen.getByRole('progressbar', { name: 'Upload progress' })).toHaveAttribute('aria-valuenow', '50');

    await settle(() => {
      uploads.last.reportProgress(11_534_336, 11_534_336);
    });

    expect(screen.getByText('Analysing the file…')).toBeInTheDocument();
  });



  it('cannot be committed twice by pressing the button again', async () => {
    let release: (() => void) | undefined;
    network = stubFetch(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { body: commitResult() };
    });
    const user = userEvent.setup();
    const { container } = renderApp(<ImportPanel />);

    await chooseFile(user, container, EXPORT);
    await settle(() => {
      uploads.last.succeed(importPreview());
    });
    await user.click(screen.getByRole('button', { name: 'Import 302 rows' }));

    const importing = await screen.findByRole('button', { name: 'Importing…' });
    expect(importing).toBeDisabled();
    await user.click(importing);
    await user.click(importing);

    expect(network.requests).toHaveLength(1);

    await settle(() => {
      release?.();
    });
    await screen.findByText('Import complete');
    expect(network.requests).toHaveLength(1);
  });


  it('turns a rejected upload into a message, leaving the file chooser in place', async () => {
    const user = userEvent.setup();
    const { container } = renderApp(<ImportPanel />);

    await chooseFile(user, container, EXPORT);
    await settle(() => {
      uploads.last.fail(413, 'Payload Too Large', {
        type: 'about:blank',
        title: 'Payload Too Large',
        status: 413,
        detail: 'The file is larger than the 32 MB limit.',
      });
    });

    expect(await screen.findByText('The file is larger than the 32 MB limit.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeInTheDocument();
  });

  it('says the upload failed when the answer came from something other than the API', async () => {
    const user = userEvent.setup();
    const { container } = renderApp(<ImportPanel />);

    await chooseFile(user, container, EXPORT);
    // A proxy error page: an HTML body and no status text for the client to quote.
    await settle(() => {
      uploads.last.answerWith(502, '<html><body>502 Bad Gateway</body></html>');
    });

    expect(await screen.findByText('Upload failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeInTheDocument();
  });

  it('says the preview could not be read when a success carries something that is not JSON', async () => {
    const user = userEvent.setup();
    const { container } = renderApp(<ImportPanel />);

    await chooseFile(user, container, EXPORT);
    await settle(() => {
      uploads.last.answerWith(200, '<!doctype html><title>index</title>');
    });

    expect(await screen.findByText('The import preview could not be parsed.')).toBeInTheDocument();
  });

  it('still says something when the upload fails in a shape the API layer never made', async () => {
    class BlockedXhr {
      readonly upload: { onprogress: null } = { onprogress: null };
      open(): void {
        // The request never gets as far as being opened for real.
      }
      setRequestHeader(): void {
        // Nor as far as carrying headers.
      }
      send(): never {
        throw new TypeError('The request was blocked before it was sent');
      }
    }
    const realXhr = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = BlockedXhr as unknown as typeof XMLHttpRequest;

    try {
      const user = userEvent.setup();
      const { container } = renderApp(<ImportPanel />);
      const input = container.querySelector<HTMLInputElement>('input[type="file"]');

      await user.upload(input as HTMLInputElement, EXPORT);

      expect(await screen.findByText('Something went wrong.')).toBeInTheDocument();
    } finally {
      globalThis.XMLHttpRequest = realXhr;
    }
  });

  it('says the API is unreachable rather than failing silently when the upload never lands', async () => {
    const user = userEvent.setup();
    const { container } = renderApp(<ImportPanel />);

    await chooseFile(user, container, EXPORT);
    await settle(() => {
      uploads.last.breakConnection();
    });

    expect(await screen.findByText(/did not reach the server/)).toBeInTheDocument();
  });

  it('brings back the sign in form when the token expires during the upload', async () => {
    const user = userEvent.setup();
    const { container } = renderApp(<ImportPanel />);

    await chooseFile(user, container, EXPORT);
    await settle(() => {
      uploads.last.fail(401, 'Unauthorized', EXPIRED);
    });

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('That session has expired. Sign in again to finish the import.')).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it('brings back the sign in form when the token expires at the commit', async () => {
    network = stubFetch(() => ({ status: 401, statusText: 'Unauthorized', body: EXPIRED }));
    const user = userEvent.setup();
    const { container } = renderApp(<ImportPanel />);

    await chooseFile(user, container, EXPORT);
    await settle(() => {
      uploads.last.succeed(importPreview());
    });
    await user.click(screen.getByRole('button', { name: 'Import 302 rows' }));

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it('finishes the import after signing in again, without a second upload', async () => {
    let commits = 0;
    network = stubFetch((request) => {
      if (request.path.endsWith('/auth/login')) {
        return { body: { accessToken: 'a.fresh.token', expiresIn: 3600, username: 'admin' } };
      }
      commits += 1;
      if (commits === 1) return { status: 401, statusText: 'Unauthorized', body: EXPIRED };
      return { body: commitResult() };
    });
    const user = userEvent.setup();
    const { container } = renderApp(<ImportPanel />);

    await chooseFile(user, container, EXPORT);
    await settle(() => {
      uploads.last.succeed(importPreview());
    });
    await user.click(screen.getByRole('button', { name: 'Import 302 rows' }));
    await screen.findByRole('button', { name: 'Sign in' });

    await user.type(screen.getByLabelText('Username'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    // The preview survived the expiry, so the file does not have to go up the wire again.
    await user.click(await screen.findByRole('button', { name: 'Import 302 rows' }));

    await screen.findByText('Import complete');
    expect(uploads.uploads).toHaveLength(1);
    expect(network.requests.at(-1)?.headers.Authorization).toBe('Bearer a.fresh.token');
  });

  it('drops the cached searches, which now describe a corpus that has changed', async () => {
    network = stubFetch(() => ({ body: commitResult() }));
    const client = createTestQueryClient();
    const resultsKey = ['search', 'results', 'q=recruiting'];
    const profileKey = ['profile', 'joeyholland'];
    client.setQueryData(resultsKey, { items: [profile()], total: 1, page: 1, size: 20, facets: [], tookMs: 4 });
    client.setQueryData(profileKey, { contentHash: 'a1b2' });
    const user = userEvent.setup();
    const { container } = renderApp(<ImportPanel />, { client });

    await chooseFile(user, container, EXPORT);
    await settle(() => {
      uploads.last.succeed(importPreview());
    });
    await user.click(screen.getByRole('button', { name: 'Import 302 rows' }));
    await screen.findByText('Import complete');

    expect(client.getQueryState(resultsKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(profileKey)?.isInvalidated).toBe(true);
  });

  it('reports what the commit actually wrote, and names what failed to index', async () => {
    const failures = Array.from({ length: 12 }, (_unused, index) => `profile-${String(index + 1)}`);
    network = stubFetch(() => ({
      body: commitResult({ profilesInserted: 253, indexed: 253, indexFailures: failures }),
    }));
    const user = userEvent.setup();
    const { container } = renderApp(<ImportPanel />);

    await chooseFile(user, container, EXPORT);
    await settle(() => {
      uploads.last.succeed(importPreview());
    });
    await user.click(screen.getByRole('button', { name: 'Import 302 rows' }));

    const done = (await screen.findByText('Import complete')).parentElement as HTMLElement;
    expect(within(done).getByText('Profiles inserted').previousElementSibling).toHaveTextContent('253');
    expect(within(done).getByText('12 profiles were stored but not indexed')).toBeInTheDocument();
    expect(within(done).getByText('profile-10')).toBeInTheDocument();
    expect(within(done).queryByText('profile-11')).not.toBeInTheDocument();
    expect(within(done).getByText(/and 2 more/)).toBeInTheDocument();
  });

  it('starts the next import from an empty file chooser', async () => {
    network = stubFetch(() => ({ body: commitResult() }));
    const user = userEvent.setup();
    const { container } = renderApp(<ImportPanel />);

    await chooseFile(user, container, EXPORT);
    await settle(() => {
      uploads.last.succeed(importPreview());
    });
    await user.click(screen.getByRole('button', { name: 'Import 302 rows' }));
    await screen.findByText('Import complete');

    await user.click(screen.getByRole('button', { name: 'Import another file' }));

    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeInTheDocument();
    expect(screen.queryByText('Import complete')).not.toBeInTheDocument();
    expect(screen.queryByText(/300 user linkedin\.csv/)).not.toBeInTheDocument();
  });
});
