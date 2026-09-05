# API

The NestJS service behind the app: it takes a LinkedIn export apart, keeps what survives validation
in PostgreSQL, projects it into Elasticsearch, and answers the search.

Setting the whole stack up is [one script at the repository root](../README.md#automatic). This file
is for working inside `backend/` once that has run at least once.

## Running it on its own

Needs PostgreSQL on 5433 and Elasticsearch on 9200 — `../run.sh` starts both and leaves them up
after Ctrl+C, so the usual loop is to run it once and then work here.

```bash
cp .env.example .env       # every value has a working default
npm install
npm run migration:run      # create the schema
npm run search:bootstrap   # create the search index
npm run start:dev          # http://localhost:3100/api
```

| | |
|---|---|
| `npm run start:dev` | watch mode |
| `npm run build` then `npm run start:prod` | compiled, and the only way that works on a Windows drive under WSL, where file watching does not |
| `npm run migration:run` | apply pending migrations |
| `npm run search:bootstrap` | create the index if it is absent — safe to re-run |
| `npm run search:reindex` | rebuild the index from PostgreSQL |
| `npm run dataset:json -- <source.csv> <target.json>` | write a comma-separated export back out as the JSON export the upload also takes |
| `npm test` / `npm run test:cov` / `npm run lint` | |

`GET /api/health` reports both stores: `{"status":"ok","postgres":true,"search":true,"profiles":0}`.
The interactive reference is at `/api/docs`, and it is served only when `NODE_ENV` is not
`production`.

## Configuration

`.env`, read once into `AppConfigService`. `.env.example` is the same file with the defaults in it,
so an empty `.env` also starts the API.

| | |
|---|---|
| `PORT` | 3100 |
| `DATABASE_HOST` `DATABASE_PORT` `DATABASE_USER` `DATABASE_PASSWORD` `DATABASE_NAME` | localhost, 5433, linkedin, linkedin, linkedin |
| `ELASTICSEARCH_NODE` `ELASTICSEARCH_INDEX` | http://localhost:9200, profiles |
| `ADMIN_USERNAME` `ADMIN_PASSWORD_HASH` | the one account the import and admin routes sit behind |
| `JWT_SECRET` `JWT_EXPIRES_IN` | 12h |
| `UPLOAD_MAX_BYTES` | 32 MB |
| `CORS_ORIGINS` | http://localhost:5173 |

The admin password is stored as a bcrypt hash, so the plaintext never exists in the process. The
committed hash is `admin`. Replace it, and `JWT_SECRET`, before this is anywhere real:

```bash
node -e "console.log(require('bcryptjs').hashSync('newpassword', 10))"
```

## Layout

Two bounded contexts, each layered the same way, plus what they share.

```
src/
  profiles/     search and read a profile
  imports/      turn an export into profiles
  auth/         the single admin account, JWT, the guards
  shared/       config, the TypeORM data source, health, problem+json, request logging
  migrations/   schema, in TypeORM migration files
  scripts/      search:bootstrap, search:reindex and dataset:json entry points
  test/         fakes, fixtures and helpers — never shipped
```

Inside `profiles/` and `imports/`:

| | |
|---|---|
| `interface/` | controllers and DTOs. HTTP shapes live here and nowhere else |
| `application/` | one file per use case, orchestration only |
| `domain/` | entities, value objects and the `ports/` the layer declares |
| `infrastructure/` | the adapters that implement those ports — TypeORM, Elasticsearch, CSV, JSON |

The direction is inward: `interface → application → domain`, with `infrastructure` implementing what
`domain` declares. **The domain imports no framework** — no Nest, no TypeORM, no Elasticsearch
client. That is not a style rule; it is what lets `frontend/src/test/contract.spec.ts` import the
field registry and the filter parser straight into Vitest and check the two sides still agree.

`src/main.ts` only creates the app and listens. Everything applied to it — global prefix, validation
pipe, Helmet, body limits, the problem+json filter, Swagger — is `configureApp` in
`src/bootstrap.ts`, so a test can stand up a real server configured exactly like the running one.

## Search

`GET /api/search` builds one Elasticsearch query from the query string.

The keyword box is a single `multi_match` over names, titles, skills, companies, schools and bios,
weighted so a name beats a passing mention in a bio. Fuzziness is on names and titles, where a typo
is likely, and off on skills, where "java" matching "javascript" would read as a bug. Past roles and
education are nested documents queried through `nested` clauses, so "manager at Garver" cannot be
answered by someone who was a manager somewhere and, separately, worked at Garver.

Filters go in filter context, so they never move the score. **OR within one filter, AND across
filters**: two skills means either skill, a skill plus a country means both.

Facet counts come from aggregations scoped to the current query, except that a filter's own values
are counted against the query *minus that filter* — otherwise picking one value would collapse the
list it was picked from.

### Adding a filterable field

Which fields are filterable is data, not code. One entry in
[`src/profiles/domain/search/field-registry.ts`](src/profiles/domain/search/field-registry.ts):

```ts
{ key: 'skills', label: 'Skills', group: 'Expertise', kind: 'terms',
  esField: 'skills', facetable: true, typeahead: true, primary: true },
```

`kind` picks how it is queried and how the frontend draws it — `terms`, `ordered_terms`, `range`,
`date_range` or `exists`. `GET /api/search/schema` serves the registry, the frontend renders
whatever it receives, so **a new filter needs no frontend change**. It does need the field to exist
in the index mapping, and `npm run search:reindex` afterwards.

## Importing

`POST /api/imports` parses and reports; it writes nothing. `POST /api/imports/:id/commit` writes what
was previewed. The split is the point: the reference export is damaged in several distinct ways —
misaligned columns, rows destroyed by unescaped delimiters, and fourteen columns that are Python
`repr()` rather than JSON — and the preview says what each row will become before anything is
persisted. `{ "repair": true }` at commit opts into realigning the rows whose offset was proved.

An upload is `.csv` or `.json`. Which one it is, is decided by the first character that is not blank
rather than by the extension, so `SniffingDatasetReader` hands the bytes to
`CsvDatasetReader` or to `JsonDatasetReader` and nothing above the port knows which read them. A
JSON export is an array of records, at the top level or under one key of a wrapper object; the
header is the union of the keys in the order the file first uses them, and a record that omits a
column contributes an empty cell. Records are located by scanning rather than by parsing the whole
document, so every row still carries the line number the rejection report and the source view are
written in terms of.

`npm run dataset:json -- <source.csv> <target.json>` writes a comma-separated export back out in
that shape; the root README says what the conversion settles and what it leaves out.

What the importer does about each defect is in
[../documentation/architecture.md](../documentation/architecture.md#the-import-pipeline).

## Errors

Every failure is `application/problem+json`, from one filter. A bad filter value, an unknown field or
a malformed range is a 400 naming the parameter — never a silent drop, which would answer a question
nobody asked.

## Tests

```bash
npm test          # jest, *.spec.ts beside the code it covers
npm run test:cov
```

Persistence, migration and schema-conformance specs need a real PostgreSQL. **Each creates and drops
its own database**, so nothing a developer has imported is ever what a test truncates. With no server
answering they skip rather than fail, and `npm test` still passes — which also means a green run on a
machine without PostgreSQL has covered less than it looks. `../run.sh` leaves one running.

Fakes for both ports live in `src/test/fakes/`, so a use-case spec needs neither store.

> The fixtures under `src/test/fixtures/` are rows lifted verbatim from the breached export — real
> names, emails and phone numbers. They are the reason the import edge cases are testable at all,
> and the reason this repository should not be public as it stands.
