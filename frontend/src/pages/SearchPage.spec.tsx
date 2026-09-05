import { afterEach, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation, useNavigate } from 'react-router-dom';
import { SearchPage } from './SearchPage';
import { facet, type FakeReply, type FetchStub, profile, type RecordedRequest, renderApp, searchResult, searchSchema, stubFetch } from '@/test';
import type { ProfileSummary, SearchResult } from '@/types/api';

let network: FetchStub | undefined;

afterEach(() => {
  network?.restore();
  network = undefined;
});

/** The search state lives in the URL, so the tests read it back the way the app writes it. */
function UrlProbe(): ReactElement {
  const location = useLocation();
  return <output data-testid="url">{location.search}</output>;
}

function url(): string {
  return screen.getByTestId('url').textContent ?? '';
}

/** The browser's Back button, so a test can see which searches earned a history entry. */
function BackButton(): ReactElement {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        void navigate(-1);
      }}
    >
      Back
    </button>
  );
}

const NAMES = [
  'joseph holland',
  'shoba murali',
  'tim martin',
  'maria gonzalez',
  'peter olsen',
  'ana ferreira',
  'liam okoro',
  'nina petrova',
];

function page(count: number, from = 0): ProfileSummary[] {
  return Array.from({ length: count }, (_unused, index) => {
    const at = from + index;
    return profile({ linkedinUsername: `person-${String(at)}`, fullName: NAMES[at % NAMES.length] });
  });
}

interface Routes {
  schema?: FakeReply;
  search?: (request: RecordedRequest) => FakeReply | Promise<FakeReply>;
}

function serve(routes: Routes): FetchStub {
  return stubFetch((request) => {
    if (request.path.endsWith('/search/schema')) return routes.schema ?? { body: searchSchema() };
    if (request.path.endsWith('/search')) return routes.search?.(request) ?? { body: searchResult() };
    return { status: 404, body: { type: 'about:blank', title: 'Not Found', status: 404 } };
  });
}

function results(overrides: Partial<SearchResult>): FakeReply {
  return { body: searchResult(overrides) };
}

function searchRequests(): RecordedRequest[] {
  return (network?.requests ?? []).filter((request) => request.path.endsWith('/search'));
}

function render(route = '/'): void {
  renderApp(
    <>
      <SearchPage />
      <UrlProbe />
      <BackButton />
    </>,
    { route },
  );
}

describe('SearchPage', () => {
  it('announces how many profiles matched and which of them are on screen', async () => {
    network = serve({ search: () => results({ items: page(20), total: 265, page: 1, size: 20, tookMs: 12 }) });
    render();

    const status = await screen.findByText('1–20 of 265 profiles · 12 ms');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('counts a single match in the singular', async () => {
    network = serve({ search: () => results({ items: page(1), total: 1, tookMs: 3 }) });
    render();

    expect(await screen.findByText('1–1 of 1 profile · 3 ms')).toBeInTheDocument();
  });

  it('says a search is running before any answer has arrived', async () => {
    network = serve({ search: () => new Promise<FakeReply>(() => undefined) });
    render();

    expect(await screen.findByText('Searching…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('shows one card per hit, in the order the API returned them', async () => {
    network = serve({ search: () => results({ items: page(3), total: 3 }) });
    render();

    const names = await screen.findAllByRole('heading', { level: 3 });
    expect(names.map((heading) => heading.textContent)).toEqual(['Joseph Holland', 'Shoba Murali', 'Tim Martin']);
  });

  it('offers a retry when the search itself fails, and runs it', async () => {
    network = serve({
      search: () => ({
        status: 400,
        statusText: 'Bad Request',
        body: { type: 'about:blank', title: 'Bad Request', status: 400, detail: 'yearsExperience must be a number.' },
      }),
    });
    const user = userEvent.setup();
    render();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('The search failed')).toBeInTheDocument();
    expect(within(alert).getByText('yearsExperience must be a number.')).toBeInTheDocument();
    const before = searchRequests().length;

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(searchRequests().length).toBeGreaterThan(before);
    });
  });

  it('does not retry a rejected search behind the reader\'s back', async () => {
    network = serve({
      search: () => ({ status: 400, statusText: 'Bad Request', body: { type: 'about:blank', title: 'Bad Request', status: 400 } }),
    });
    render();

    await screen.findByRole('alert');
    expect(searchRequests()).toHaveLength(1);
  });

  it('offers to drop the keywords when only they matched nothing', async () => {
    network = serve({ search: () => results({ items: [], total: 0 }) });
    const user = userEvent.setup();
    render('/?q=quantum%20basketweaving');

    await screen.findByText('No profiles match this search');
    expect(screen.getByText('No matches')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear keywords' }));

    expect(url()).not.toContain('q=');
  });

  it('sends the reader to the import page when the index itself is empty', async () => {
    network = serve({ search: () => results({ items: [], total: 0 }) });
    render();

    expect(await screen.findByText(/The index has no profiles yet/)).toBeInTheDocument();
  });

  it('pages forward without losing the search, and records the page in the URL', async () => {
    network = serve({
      search: (request) => {
        const at = new URLSearchParams(request.search).get('page') ?? '1';
        return results({ items: page(20, (Number(at) - 1) * 20), total: 265, page: Number(at), size: 20 });
      },
    });
    const user = userEvent.setup();
    render('/?q=recruiting');

    await screen.findByText('1–20 of 265 profiles · 7 ms');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('21–40 of 265 profiles · 7 ms')).toBeInTheDocument();
    expect(url()).toContain('page=2');
    expect(url()).toContain('q=recruiting');
    expect(searchRequests().at(-1)?.search).toContain('page=2');
  });

  it('a page past the last result offers the way back rather than an impossible range', async () => {
    network = serve({
      search: (request) => {
        const at = Number(new URLSearchParams(request.search).get('page') ?? '1');
        return results({ items: at === 1 ? page(20) : [], total: 265, page: at, size: 20, tookMs: 4 });
      },
    });
    const user = userEvent.setup();
    render('/?page=99');

    expect(await screen.findByText('Page 99 is past the last result')).toBeInTheDocument();
    expect(screen.getByText('265 profiles · 4 ms')).toBeInTheDocument();
    expect(screen.queryByText('No profiles match this search')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to the first page' }));

    expect(await screen.findByText('1–20 of 265 profiles · 4 ms')).toBeInTheDocument();
    expect(url()).not.toContain('page=');
  });

  it('keeps keyword search working when the schema, and so the filter bar, cannot be loaded', async () => {
    network = serve({
      schema: { status: 404, statusText: 'Not Found', body: { type: 'about:blank', title: 'Not Found', status: 404 } },
      search: () => results({ items: page(2), total: 2 }),
    });
    render();

    expect(await screen.findByText(/Filters are unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search profiles' })).toBeInTheDocument();
    expect(await screen.findAllByRole('heading', { level: 3 })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Add filter/ })).not.toBeInTheDocument();
  });

  it('takes its sort options from the schema and puts the chosen one in the URL', async () => {
    network = serve({ search: () => results({ items: page(3), total: 3 }) });
    const user = userEvent.setup();
    render();

    await screen.findAllByRole('heading', { level: 3 });
    await user.selectOptions(screen.getByLabelText('Sort'), 'connections');

    expect(url()).toContain('sort=connections');
    await waitFor(() => {
      expect(searchRequests().at(-1)?.search).toContain('sort=connections');
    });
  });

  it('searches once the typing settles rather than once per keystroke', async () => {
    network = serve({ search: () => results({ items: page(2), total: 2 }) });
    const user = userEvent.setup();
    render();

    await screen.findAllByRole('heading', { level: 3 });
    const before = searchRequests().length;
    await user.type(screen.getByRole('searchbox', { name: 'Search profiles' }), 'recruiting');

    await waitFor(() => {
      expect(url()).toContain('q=recruiting');
    });
    await waitFor(() => {
      expect(searchRequests().at(-1)?.search).toContain('q=recruiting');
    });
    expect(searchRequests().length - before).toBeLessThan('recruiting'.length);
  });

  it('goes back to page one when the search itself changes', async () => {
    network = serve({
      search: (request) => {
        const at = Number(new URLSearchParams(request.search).get('page') ?? '1');
        return results({ items: page(20, (at - 1) * 20), total: 265, page: at, size: 20 });
      },
    });
    const user = userEvent.setup();
    render('/?page=3&sort=name');

    await screen.findByText('41–60 of 265 profiles · 7 ms');
    await user.selectOptions(screen.getByLabelText('Sort'), 'quality');

    await waitFor(() => {
      expect(url()).not.toContain('page=');
    });
  });

  it('asks the next search for the counts of a field whose filter is opened', async () => {
    network = serve({
      search: (request) =>
        results({
          items: page(4),
          total: 4,
          facets: new URLSearchParams(request.search).get('facets') === 'industry'
            ? [facet('industry', [['civil engineering', 3], ['military', 1]])]
            : [],
        }),
    });
    const user = userEvent.setup();
    render();

    await screen.findAllByRole('heading', { level: 3 });
    await user.click(screen.getByRole('button', { name: /^Industry/ }));

    await waitFor(() => {
      expect(url()).toContain('facets=industry');
    });
    expect(await screen.findByRole('option', { name: /civil engineering/ })).toHaveTextContent('3');
  });

  it('applies a filter chosen in the bar to the URL and to the search', async () => {
    network = serve({
      search: () =>
        results({ items: page(4), total: 4, facets: [facet('industry', [['civil engineering', 3], ['military', 1]])] }),
    });
    const user = userEvent.setup();
    render('/?page=4');

    await screen.findAllByRole('heading', { level: 3 });
    await user.click(screen.getByRole('button', { name: /^Industry/ }));
    await user.click(await screen.findByRole('option', { name: /civil engineering/ }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    const kept = new URLSearchParams(url()).get('f.industry');
    expect(kept === null ? '' : decodeURIComponent(kept)).toBe('civil engineering');
    expect(url()).not.toContain('page=4');
    await waitFor(() => {
      expect(searchRequests().at(-1)?.search).toContain('f.industry=civil%20engineering');
    });
  });

  it('offers the facet counts the search came back with', async () => {
    network = serve({
      search: () =>
        results({
          items: page(4),
          total: 4,
          facets: [facet('seniority', [['manager', 3], ['senior', 1]])],
        }),
    });
    render();

    expect(await screen.findByRole('button', { name: /Seniority/ })).toBeInTheDocument();
  });
  it('a submitted search earns a history entry, so Back steps between searches', async () => {
    network = serve({ search: () => results({ items: page(2), total: 2 }) });
    const user = userEvent.setup();
    render();
    const box = await screen.findByRole('searchbox', { name: 'Search profiles' });

    await user.type(box, 'recruiting');
    await waitFor(() => {
      expect(url()).toContain('q=recruiting');
    });

    // Enter submits the form, which commits without replacing the entry the typing wrote.
    await user.type(box, '{Enter}');
    await user.clear(box);
    await user.type(box, 'hiring');
    await waitFor(() => {
      expect(url()).toContain('q=hiring');
    });

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByDisplayValue('recruiting')).toBeInTheDocument();
    expect(url()).toContain('q=recruiting');
  });

  it('drops every filter at once from the bar, keeping the keywords', async () => {
    network = serve({ search: () => results({ items: page(2), total: 2 }) });
    const user = userEvent.setup();
    render('/?q=recruiting&f.industry=military&f.country=united%20states');

    await screen.findAllByRole('heading', { level: 3 });
    await user.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(url()).not.toContain('f.industry');
    expect(url()).not.toContain('f.country');
    expect(url()).toContain('q=recruiting');
  });

  it('drops the narrowest filter from the empty state that named it', async () => {
    network = serve({ search: () => results({ items: [], total: 0 }) });
    const user = userEvent.setup();
    render('/?f.industry=military&f.country=united%20states');

    await screen.findByText('No profiles match this search');
    await user.click(screen.getByRole('button', { name: 'Remove Industry: Military' }));

    // Only the one it offered comes off; the other filter is still worth trying on its own.
    expect(new URLSearchParams(url()).get('f.industry')).toBeNull();
    expect(new URLSearchParams(url()).get('f.country')).toBe('united%20states');
  });

  it('drops every filter from the empty state when none of them is the problem', async () => {
    network = serve({ search: () => results({ items: [], total: 0 }) });
    const user = userEvent.setup();
    render('/?f.industry=military&f.country=united%20states');

    await screen.findByText('No profiles match this search');
    await user.click(screen.getByRole('button', { name: 'Clear all filters' }));

    expect(url()).not.toContain('f.');
  });

  it('does not ask twice for a facet the search is already carrying', async () => {
    // The response has no buckets for industry, so the bar would keep asking without the guard.
    network = serve({ search: () => results({ items: page(2), total: 2, facets: [] }) });
    const user = userEvent.setup();
    render('/?facets=industry');

    await screen.findAllByRole('heading', { level: 3 });
    await user.click(screen.getByRole('button', { name: /^Industry/ }));

    expect(new URLSearchParams(url()).get('facets')).toBe('industry');
  });
});
