/** The routing table and the shell around it: which screen a URL reaches, and what a failure costs. */

import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { ErrorBoundary } from '@/components/layout';
import { fakeFetch, jsonResponse, renderApp } from '@/test';
import { searchSchema, searchResult } from '@/test/fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

function serveApi(): void {
  const fake = fakeFetch((request) => {
    if (request.url.includes('/api/search/schema')) return jsonResponse(searchSchema());
    if (request.url.includes('/api/search')) return jsonResponse(searchResult());
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fake.fetch);
}

describe('App routes', () => {
  it('opens the search screen at the root', async () => {
    serveApi();
    renderApp(<App />, { route: '/' });

    expect(await screen.findByRole('search')).toBeInTheDocument();
  });

  it('opens the import screen at /import', async () => {
    serveApi();
    renderApp(<App />, { route: '/import' });

    expect(await screen.findByRole('heading', { level: 1, name: /import/i })).toBeInTheDocument();
  });

  it('offers a way back from a URL that matches nothing', async () => {
    serveApi();
    renderApp(<App />, { route: '/nowhere' });

    expect(await screen.findByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to search' })).toHaveAttribute('href', '/');
  });

  it('keeps the header and the other routes reachable from an unknown URL', async () => {
    serveApi();
    renderApp(<App />, { route: '/nowhere' });

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Search' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Import' })).toBeInTheDocument();
  });
});

function Exploding(): never {
  throw new Error('the render blew up');
}

describe('ErrorBoundary', () => {
  it('renders its children while nothing has failed', () => {
    renderApp(
      <ErrorBoundary>
        <p>the screen</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('the screen')).toBeInTheDocument();
  });

  it('shows the failure instead of a blank page, and says the imported data is safe', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    renderApp(
      <ErrorBoundary>
        <Exploding />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('This screen could not be displayed')).toBeInTheDocument();
    expect(within(alert).getByText('the render blew up')).toBeInTheDocument();
    expect(alert).toHaveTextContent(/already imported is not[\s\S]*affected/);
    expect(logged).toHaveBeenCalled();

    logged.mockRestore();
  });

  it('offers a retry and a way back to search', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let shouldFail = true;
    function Sometimes(): ReactElement {
      if (shouldFail) throw new Error('not yet');
      return <p>recovered</p>;
    }

    renderApp(
      <ErrorBoundary>
        <Sometimes />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('link', { name: 'Back to search' })).toHaveAttribute('href', '/');

    shouldFail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('recovered')).toBeInTheDocument();
    logged.mockRestore();
  });
});
