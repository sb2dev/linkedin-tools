# App

The React app: search, filter, read a profile, and drive the import. Vite serves the page and
proxies `/api` to the API, so the browser only ever talks to one origin and CORS never comes up.

Setting the whole stack up is [one script at the repository root](../README.md#automatic). This file
is for working inside `frontend/` once that has run at least once.

## Running it on its own

Needs the API answering on 3100 — `../run.sh` starts it and leaves it up after Ctrl+C.

```bash
npm install
npm run dev            # http://localhost:5173
```

| | |
|---|---|
| `npm run dev` | dev server, HMR |
| `npm run build` | `tsc -b` then `vite build` into `dist/` |
| `npm run preview` | serve that build |
| `npm test` / `npm run test:watch` / `npm run test:cov` | |
| `npm run lint` | |

Two environment variables, both read in [`vite.config.ts`](vite.config.ts) and both optional:
`PORT` (5173) and `API_URL` (`http://localhost:3100`), the proxy target.

React 19, React Router 7, TanStack Query for server state, Zustand for the little that is not,
Tailwind 4 through its Vite plugin.

## Layout

```
src/
  pages/        one per route: SearchPage, ProfilePage, ImportPage
  components/
    filters/      the filter bar, the "add filter" panel, and controls/ — one per filter kind
    results/      result cards, sorting, pagination, empty and error states
    profile/      the profile screen's sections
    import/       upload, preview, rejections, corpus admin
    layout/       AppShell, ErrorBoundary, shared class strings
  api/          the fetch client and one module per API area
  hooks/        use-search, use-auth
  lib/          query-state (the URL), format
  types/        the API's shapes
  test/         harness, fakes, fixtures, and the contract spec
```

Every route is wrapped in its own `ErrorBoundary`, so a failure on one screen leaves the header and
the other routes reachable rather than blanking the page.

`@/` resolves to `src/`, in [`vite.config.ts`](vite.config.ts), [`vitest.config.ts`](vitest.config.ts)
and `tsconfig.json` alike. Both configs resolve it with `fileURLToPath(new URL(...))` rather than
`.pathname`, because `.pathname` keeps a file URL's percent-encoding and every `@/` import breaks
when the checkout path contains a space.

## The URL is the state

[`src/lib/query-state.ts`](src/lib/query-state.ts) parses the whole search — keywords, every filter,
sort, page — out of `URLSearchParams` and writes it back. Nothing about a search lives in a
component's state, which is what makes a result page shareable and the back button walk searches
rather than keystrokes.

Filters are flat parameters, one per field, `f.` prefixed:

```
?q=engineer&f.skills=leadership,training&f.yearsExperience=5..15&sort=name&page=2
```

Values are URL-encoded individually, so a comma inside a value survives as `%2C` — which is how the
salary bands are sent, since their labels contain commas.

Parsing needs to know a field's kind (`5..15` is a range, `a,b` is a term list), and kinds come from
the server's schema, so `parseSearchQuery` takes a lookup rather than guessing.

## Filters are rendered from the server

The app does not know which fields are filterable. `GET /api/search/schema` returns the backend's
field registry — key, label, group, kind — and the UI draws whatever it receives. Each `kind` maps to
one control in [`src/components/filters/controls/`](src/components/filters/controls):

| kind | control |
|---|---|
| `terms` | `TermsControl`, or `TypeaheadControl` when the field is marked high-cardinality |
| `ordered_terms` | `OrderedTermsControl` — ordered chips, not a slider |
| `range` | `RangeControl` |
| `date_range` | `DateRangeControl` |
| `exists` | `ExistsControl` — tri-state |

So **adding a filter is a backend change only**. Adding a new *kind* is the case that needs a control
here, and the union in the backend registry is where to look first.

Option counts come from the same response as the results.

## The import screen

Two steps, because the API has two: the upload previews and writes nothing, and a separate commit
writes what was previewed. [`ImportPanel`](src/components/import/ImportPanel.tsx) drives both and
holds the preview between them. The commit it sends carries `repair: false`; the preview still shows
which rows a repairing run would realign, but choosing that policy is an API call, not a control on
this screen.

[`FileDropzone`](src/components/import/FileDropzone.tsx) accepts `.csv` and `.json`, up to 32 MB. The
list and the size are one constant each, and both mirror the API — the extension check in
`ImportsController` and `UPLOAD_MAX_BYTES` — so a file the browser lets through is one the API will
take. The check is there to fail in a millisecond instead of after a five-megabyte body, not to be
the authority: the API sniffs the bytes and decides for itself.

`XMLHttpRequest`, not `fetch`, is what sends the upload, for the one thing `fetch` still cannot do —
report progress while a request body goes out.

## Tests

```bash
npm test          # vitest, 663 tests
npm run test:cov  # fails below 100% of statements, branches, functions and lines
```

Testing Library on happy-dom, specs beside the code they cover. Only `src/main.tsx` is excluded from
coverage: running it is running the program.

The one worth knowing about is
[`src/test/contract.spec.ts`](src/test/contract.spec.ts). It imports the **backend's** field registry
and filter parser directly — the backend's domain layer pulls in no framework, so it loads straight
into Vitest — and round-trips this app's URL encoding through the real parser. Without it the two
sides can disagree about what `f.yearsExperience=5..15` means and nothing fails to compile.

## Contact details

Emails, phone numbers and addresses are masked behind an explicit reveal, and the API only returns
them with a token. The data is real personal information from a breach; the UI is built so that
looking at a profile is not the same as broadcasting it.
