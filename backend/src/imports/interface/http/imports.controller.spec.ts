/** The two-step upload, over real HTTP with the real reader and use cases: */

import type { INestApplication } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import type { Test as SuperTest } from 'supertest';
import { CommitImportUseCase } from '../../application/commit-import.use-case';
import { DescribeSourceRowUseCase } from '../../application/describe-source-row.use-case';
import { ListImportsUseCase } from '../../application/list-imports.use-case';
import { PreviewImportUseCase } from '../../application/preview-import.use-case';
import { DATASET_READER } from '../../domain/ports/dataset-reader.port';
import { IMPORT_SESSION_REPOSITORY } from '../../domain/ports/import-session-repository.port';
import { CsvDatasetReader } from '../../infrastructure/csv/csv-dataset.reader';
import { JsonDatasetReader } from '../../infrastructure/json/json-dataset.reader';
import { SniffingDatasetReader } from '../../infrastructure/sniffing-dataset.reader';
import { PROFILE_REPOSITORY } from 'src/profiles/domain/ports/profile-repository.port';
import { PROFILE_SEARCH } from 'src/profiles/domain/ports/profile-search.port';
import { asProblem, createHttpApp } from 'src/test/http/app';
import { authWiring, bearerToken } from 'src/test/http/auth';
import {
  FakeImportSessionRepository,
  FakeProfileRepository,
  FakeProfileSearch,
  columnOf,
  csvOf,
  jsonOf,
  rowOf,
} from 'src/test/fakes';
import { CommitResultDto } from './dto/commit-result.dto';
import { ImportPreviewDto, ImportRunListDto } from './dto/import-preview.dto';
import { ImportRowSourceDto } from './dto/import-row-source.dto';
import { ImportsController } from './imports.controller';

/** One clean row, one scrambled row, and one of each way the export is damaged. */
const DATASET = csvOf([
  rowOf('clean'),
  rowOf('junkUnrecoverable'),
  rowOf('embeddedHeader'),
  rowOf('fieldCountMismatch'),
  rowOf('scrambledOffsetMinus1'),
]);

/** The same rows as a JSON export, minus the one whose damage only a delimited file can carry. */
const DATASET_AS_JSON = jsonOf([
  rowOf('clean'),
  rowOf('junkUnrecoverable'),
  rowOf('embeddedHeader'),
  rowOf('scrambledOffsetMinus1'),
]);

const UPLOAD_LIMIT = 32 * 1024 * 1024;

/** Personal data the accepted row carries, which the preview has no business repeating. */
const SOURCE_EMAIL = 'j3holland@yahoo.com';
const SOURCE_PHONE = '+19402058928';

describe('the import endpoints', () => {
  let app: INestApplication;
  let token: string;
  let profiles: FakeProfileRepository;
  let sessions: FakeImportSessionRepository;
  let search: FakeProfileSearch;

  async function buildApp(
    maxBytes = UPLOAD_LIMIT,
    sessionStore: FakeImportSessionRepository = new FakeImportSessionRepository(),
  ): Promise<INestApplication> {
    profiles = new FakeProfileRepository();
    sessions = sessionStore;
    search = new FakeProfileSearch();

    const wiring = authWiring();
    return createHttpApp({
      imports: [
        ...wiring.imports,
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
        MulterModule.register({ limits: { fileSize: maxBytes, files: 1 } }),
      ],
      controllers: [ImportsController],
      providers: [
        ...wiring.providers,
        CsvDatasetReader,
        JsonDatasetReader,
        PreviewImportUseCase,
        CommitImportUseCase,
        ListImportsUseCase,
        DescribeSourceRowUseCase,
        { provide: DATASET_READER, useClass: SniffingDatasetReader },
        { provide: PROFILE_REPOSITORY, useValue: profiles },
        { provide: PROFILE_SEARCH, useValue: search },
        { provide: IMPORT_SESSION_REPOSITORY, useValue: sessions },
      ],
    });
  }

  beforeEach(async () => {
    app = await buildApp();
    token = await bearerToken(app);
  });

  afterEach(async () => {
    await app.close();
  });

  const authorised = (call: SuperTest): SuperTest => call.set('Authorization', `Bearer ${token}`);

  const upload = (file: Buffer, filename = 'export.csv'): SuperTest =>
    authorised(request(app.getHttpServer()).post('/api/imports')).attach('file', file, filename);

  const previewOf = async (): Promise<ImportPreviewDto> => {
    const response = await upload(DATASET);
    expect(response.status).toBe(201);
    return response.body as ImportPreviewDto;
  };

  const commit = (importId: string, body?: Record<string, unknown>): SuperTest => {
    const call = authorised(request(app.getHttpServer()).post(`/api/imports/${importId}/commit`));
    return body === undefined ? call : call.send(body);
  };

  /** Well formed, and nothing is stored under it: the shape is right, the import is absent. */
  const ABSENT_ID = '2f1c9b2e-0000-4000-8000-000000000000';

  /** A store that is down. Nothing here is a documented failure, so nothing may be dressed as one. */
  class SessionsThatFail extends FakeImportSessionRepository {
    async findById(): Promise<never> {
      throw new Error('connection terminated unexpectedly');
    }
  }

  describe('a failure the endpoints do not have a status for', () => {
    it('lets it surface as a 500 rather than reporting it as a bad request', async () => {
      await app.close();
      app = await buildApp(UPLOAD_LIMIT, new SessionsThatFail());
      token = await bearerToken(app);

      const response = await authorised(request(app.getHttpServer()).get(`/api/imports/${ABSENT_ID}`));

      expect(response.status).toBe(500);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    });
  });

  /**
   * The handle is a uuid column. Left unchecked, Postgres refused to cast a malformed one and the
   * caller was told "an unexpected error occurred" with a 500 - for a request that is simply wrong.
   */
  describe('a handle that is not an import id', () => {
    it.each([
      ['reading a preview', (server: request.Agent) => server.get('/api/imports/not-a-uuid')],
      ['reading a source line', (server: request.Agent) => server.get('/api/imports/not-a-uuid/rows/5')],
      ['committing', (server: request.Agent) => server.post('/api/imports/not-a-uuid/commit')],
    ])('is a 400 naming the parameter, not a 500, when %s', async (_label, call) => {
      const response = await authorised(call(request(app.getHttpServer())));

      expect(response.status).toBe(400);
      expect(asProblem(response.body).errors?.importId).toEqual([
        'importId is not an import handle',
      ]);
    });

    it('rejects a line number that is not a positive whole number', async () => {
      const response = await authorised(
        request(app.getHttpServer()).get(`/api/imports/${ABSENT_ID}/rows/0`),
      );

      expect(response.status).toBe(400);
      expect(asProblem(response.body).errors?.lineNumber).toEqual(['lineNumber must be 1 or more']);
    });

    it('still answers 404 for a well-formed handle no import matches', async () => {
      const response = await authorised(request(app.getHttpServer()).get(`/api/imports/${ABSENT_ID}`));

      expect(response.status).toBe(404);
    });
  });

  describe('the token', () => {
    it('is required to upload, and nothing is read without it', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/imports')
        .attach('file', DATASET, 'export.csv');

      expect(response.status).toBe(401);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(await sessions.listRecent(10)).toEqual([]);
    });

    it('is required to list, to read a preview and to commit', async () => {
      const server = request(app.getHttpServer());

      await expect(server.get('/api/imports').then((r) => r.status)).resolves.toBe(401);
      await expect(server.get('/api/imports/any-id').then((r) => r.status)).resolves.toBe(401);
      await expect(
        server.post('/api/imports/any-id/commit').then((r) => r.status),
      ).resolves.toBe(401);
    });

    it('is required to read a source line, which is the rawest thing the API returns', async () => {
      const preview = await previewOf();

      const response = await request(app.getHttpServer()).get(
        `/api/imports/${preview.importId}/rows/2`,
      );

      expect(response.status).toBe(401);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(JSON.stringify(response.body)).not.toContain(SOURCE_EMAIL);
    });
  });

  describe('the source line behind a row', () => {
    const sourceRow = (importId: string, line: number | string): SuperTest =>
      authorised(request(app.getHttpServer()).get(`/api/imports/${importId}/rows/${line}`));

    it('shows the line as the file wrote it, and what each column became', async () => {
      const preview = await previewOf();

      const response = await sourceRow(preview.importId, 2);
      const { line } = response.body as ImportRowSourceDto;

      expect(response.status).toBe(200);
      expect(line.lineNumber).toBe(2);
      expect(line.accepted).toBe(true);
      expect(line.identity?.linkedinUsername).toBe('joeyholland');
      expect(line.columns).toHaveLength(line.expectedFieldCount);

      const title = line.columns.find((column) => column.column === 'job_title');
      expect(title).toMatchObject({ target: 'job.title', verdict: 'kept' });
    });

    it('is the one endpoint that repeats the contact columns the preview holds back', async () => {
      const preview = await previewOf();

      const [table, source] = [
        JSON.stringify((await authorised(request(app.getHttpServer()).get(`/api/imports/${preview.importId}`))).body),
        JSON.stringify((await sourceRow(preview.importId, 2)).body),
      ];

      expect(table).not.toContain(SOURCE_EMAIL);
      expect(source).toContain(SOURCE_EMAIL);
      expect(source).toContain(SOURCE_PHONE);
    });

    it('says why a rejected line never became a person', async () => {
      const preview = await previewOf();

      const mismatched = preview.rows.find(
        (row) => row.rejection?.reason === 'FIELD_COUNT_MISMATCH',
      );

      const { line } = (await sourceRow(preview.importId, mismatched!.lineNumber))
        .body as ImportRowSourceDto;

      expect(line.accepted).toBe(false);
      expect(line.rejection?.reason).toBe('FIELD_COUNT_MISMATCH');
      expect(line.rejection?.detail).toContain('header declares');
    });

    it('says what the repair would move on a scrambled line', async () => {
      const preview = await previewOf();
      const scrambled = preview.rows.find((row) => row.outcome.scrambled);

      const { line } = (await sourceRow(preview.importId, scrambled!.lineNumber))
        .body as ImportRowSourceDto;

      expect(line.scrambled).toBe(true);
      expect(line.repair?.offset).toBe(-1);
      expect(line.repair?.moves.length).toBeGreaterThan(0);
    });

    it('names a line the file does not have', async () => {
      const preview = await previewOf();

      const response = await sourceRow(preview.importId, 900);

      expect(response.status).toBe(404);
      expect(asProblem(response.body).detail).toContain('has no row on line 900');
    });

    it('refuses a line number that is not one', async () => {
      const preview = await previewOf();

      expect((await sourceRow(preview.importId, 'seven')).status).toBe(400);
    });

    it('reports an unknown import as such', async () => {
      const response = await sourceRow('2f1c9b2e-0000-4000-8000-000000000000', 2);

      expect(response.status).toBe(404);
      expect(asProblem(response.body).detail).toContain('no import session');
    });

    it('says clearly that a committed import no longer holds the file', async () => {
      const preview = await previewOf();
      await commit(preview.importId);

      const response = await sourceRow(preview.importId, 2);

      expect(response.status).toBe(409);
      expect(asProblem(response.body).detail).toContain('no longer stored');
    });
  });

  describe('refusing what is not a dataset', () => {
    it('asks for the file when the request carries none', async () => {
      const response = await authorised(request(app.getHttpServer()).post('/api/imports'));

      expect(response.status).toBe(400);
      expect(asProblem(response.body).detail).toContain('multipart field named "file"');
    });

    it('asks for the file when the multipart body carries only other fields', async () => {
      const response = await authorised(request(app.getHttpServer()).post('/api/imports')).field(
        'repair',
        'true',
      );

      expect(response.status).toBe(400);
      expect(asProblem(response.body).detail).toContain('multipart field named "file"');
    });

    it('refuses an empty file rather than reporting an import of nothing', async () => {
      const response = await upload(Buffer.alloc(0), 'export.csv');

      expect(response.status).toBe(400);
    });

    it.each([
      ['a spreadsheet', 'export.xlsx'],
      ['a plain text file', 'export.txt'],
      ['no extension at all', 'export'],
    ])('refuses %s with a 415 that names what it does accept', async (_label, filename) => {
      const response = await upload(DATASET, filename);

      expect(response.status).toBe(415);
      expect(asProblem(response.body).detail).toContain('.csv, .json');
    });

    it('refuses JSON that is not an array of records, with 400 rather than 500', async () => {
      const response = await upload(Buffer.from('{"count": 0}', 'utf8'), 'export.json');

      expect(response.status).toBe(400);
      expect(asProblem(response.body).detail).toContain('no array of records');
    });

    it('refuses a binary file wearing a .csv extension', async () => {
      const binary = Buffer.concat([Buffer.from('full_name,linkedin_url\n'), Buffer.from([0x00, 0x01, 0x02])]);

      const response = await upload(binary, 'export.csv');

      expect(response.status).toBe(415);
      expect(asProblem(response.body).detail).toContain('binary');
    });

    it('refuses a text file whose first line is not a comma-separated header', async () => {
      const response = await upload(Buffer.from('this is a note\nand another line\n'), 'notes.csv');

      expect(response.status).toBe(400);
      expect(asProblem(response.body).detail).toContain('comma-separated header');
    });

    it('refuses a file that has a header and no rows', async () => {
      const response = await upload(Buffer.from('full_name,linkedin_url\n'), 'export.csv');

      expect(response.status).toBe(400);
      expect(asProblem(response.body).detail).toContain('no data rows');
    });

    it('refuses a file that is nothing but blank lines', async () => {
      const response = await upload(Buffer.from('\r\n\r\n\r\n'), 'export.csv');

      expect(response.status).toBe(400);
      expect(asProblem(response.body).detail).toContain('no header row');
    });

    it('refuses a file the parser gives up on, with 400 rather than 500', async () => {
      // One quoted field holding the comma the sniff looked for: the parser reads a header of one.
      const response = await upload(Buffer.from('"full_name,linkedin_url"\r\nada,ada\r\n'), 'export.csv');

      expect(response.status).toBe(400);
      expect(asProblem(response.body).detail).toContain('comma-separated CSV header');
    });

    it('refuses a readable CSV that is not a profile export, with 400 rather than 500', async () => {
      const response = await upload(Buffer.from('one,two\r\nalpha,beta\r\n'), 'export.csv');

      expect(response.status).toBe(400);
      expect(asProblem(response.body).detail).toContain('full_name');
      expect(asProblem(response.body).detail).toContain('linkedin_url');
    });

    it('rejects a file over the configured size limit with a document, not a bare 413', async () => {
      await app.close();
      app = await buildApp(512);
      token = await bearerToken(app);

      const response = await upload(DATASET);

      expect(response.status).toBe(413);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(asProblem(response.body).title).toBe('Payload too large');
      expect(asProblem(response.body).detail).toMatch(/too large|size limit/i);
      expect(await sessions.listRecent(10)).toEqual([]);
    });
  });

  describe('POST /api/imports', () => {
    it('reports what the file contains without writing anything to the corpus', async () => {
      const preview = await previewOf();

      expect(preview.importId).toHaveLength(36);
      expect(preview.filename).toBe('export.csv');
      expect(preview.sizeBytes).toBe(DATASET.byteLength);
      expect(preview.status).toBe('previewed');
      expect(preview.counts).toMatchObject({
        rowsTotal: 5,
        rowsAccepted: 2,
        rowsRejected: 3,
        profilesNew: 2,
        profilesUpdated: 0,
        scrambledRows: 1,
      });
      expect(profiles.profiles.size).toBe(0);
      expect(search.indexed).toEqual([]);
    });

    it('reads a JSON export into the same import, counts and rejections as the CSV one', async () => {
      const fromCsv = await upload(csvOf([
        rowOf('clean'),
        rowOf('junkUnrecoverable'),
        rowOf('embeddedHeader'),
        rowOf('scrambledOffsetMinus1'),
      ]));
      const response = await upload(DATASET_AS_JSON, 'export.json');
      const fromJson = response.body as ImportPreviewDto;

      expect(response.status).toBe(201);
      expect(fromJson.filename).toBe('export.json');
      expect(fromJson.counts).toEqual((fromCsv.body as ImportPreviewDto).counts);
      expect(fromJson.countsWithRepair).toEqual((fromCsv.body as ImportPreviewDto).countsWithRepair);
      expect(fromJson.rejections.map((group) => [group.reason, group.count])).toEqual(
        (fromCsv.body as ImportPreviewDto).rejections.map((group) => [group.reason, group.count]),
      );
      expect(fromJson.rows.map((row) => row.linkedinUsername)).toEqual(
        (fromCsv.body as ImportPreviewDto).rows.map((row) => row.linkedinUsername),
      );
    });

    it('shows the record behind a row of a JSON import as the file wrote it', async () => {
      const preview = (await upload(DATASET_AS_JSON, 'export.json')).body as ImportPreviewDto;
      const accepted = preview.rows.find((row) => row.linkedinUsername === 'joeyholland');

      const response = await authorised(
        request(app.getHttpServer()).get(`/api/imports/${preview.importId}/rows/${accepted!.lineNumber}`),
      );
      const { line } = response.body as ImportRowSourceDto;

      expect(response.status).toBe(200);
      expect(line.accepted).toBe(true);
      expect(line.raw.trimStart().startsWith('{')).toBe(true);
      expect(line.columns.find((column) => column.column === 'job_title')).toMatchObject({
        target: 'job.title',
        verdict: 'kept',
      });
    });

    it('groups every rejected line by reason, with a line number a human can find', async () => {
      const preview = await previewOf();
      const byReason = new Map(preview.rejections.map((group) => [group.reason, group]));

      expect([...byReason.keys()].sort()).toEqual([
        'EMBEDDED_HEADER',
        'FIELD_COUNT_MISMATCH',
        'JUNK_LINE',
      ]);
      expect(byReason.get('JUNK_LINE')?.samples[0].lineNumber).toBe(3);
      expect(byReason.get('EMBEDDED_HEADER')?.count).toBe(1);
      expect(byReason.get('FIELD_COUNT_MISMATCH')?.label.length).toBeGreaterThan(0);
    });

    it('prices the repair option, so the operator chooses on numbers', async () => {
      const preview = await previewOf();

      expect(preview.counts.scrambledRows).toBe(1);
      expect(preview.countsWithRepair).toMatchObject({ scrambledRows: 0, realignedRows: 1 });
      expect(preview.countsWithRepair.fieldsQuarantined).toBeLessThan(
        preview.counts.fieldsQuarantined,
      );
      expect(preview.repairSample[0]).toMatchObject({ linkedinUsername: 'tsmartin', offset: -1 });
    });

    it('describes every row of the file over the wire, one entry per source line', async () => {
      const preview = await previewOf();

      expect(preview.rows).toHaveLength(preview.counts.rowsTotal);
      expect(preview.rowsOmitted).toBe(0);
      expect(preview.rows[0]).toMatchObject({
        lineNumber: 2,
        linkedinUsername: 'joeyholland',
        fullName: expect.any(String),
        outcome: { status: 'new', totalSkills: expect.any(Number) },
      });
      const scrambled = preview.rows.find((row) => row.outcome.scrambled);
      expect(scrambled?.linkedinUsername).toBe('tsmartin');
      expect(scrambled?.withRepair).toMatchObject({ realigned: true, offset: -1 });
      const rejected = preview.rows.filter((row) => row.outcome.status === 'rejected');
      expect(rejected).toHaveLength(3);
      expect(rejected[0].rejection?.reason).toBe('JUNK_LINE');
    });

    it('repeats no email address or phone number the file supplied', async () => {
      expect(columnOf(rowOf('clean'), 'emails')).toContain(SOURCE_EMAIL);
      expect(columnOf(rowOf('clean'), 'phone_numbers')).toContain(SOURCE_PHONE);

      const body = JSON.stringify(await previewOf());

      expect(body).not.toContain(SOURCE_EMAIL);
      expect(body).not.toContain(SOURCE_PHONE);
      expect(body).not.toContain('@yahoo.com');
    });

    it('refuses a request carrying more than one file, with a 400 rather than a 500', async () => {
      const response = authorised(request(app.getHttpServer()).post('/api/imports'))
        .attach('file', DATASET, 'export.csv')
        .attach('file', DATASET, 'again.csv');

      await expect(response.then((result) => result.status)).resolves.toBe(400);
    });

    it('keeps every rejected line, not only the three it shows', async () => {
      const preview = await previewOf();

      expect(sessions.rejectionsOf(preview.importId)).toHaveLength(3);
    });

    it('refuses a sixth upload in the same minute', async () => {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        statuses.push((await upload(DATASET)).status);
      }

      expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    });
  });

  describe('reading a preview back', () => {
    it('answers with the stored report', async () => {
      const preview = await previewOf();

      const response = await authorised(
        request(app.getHttpServer()).get(`/api/imports/${preview.importId}`),
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(preview);
    });

    it('answers 404 for an import nobody uploaded', async () => {
      const response = await authorised(
        request(app.getHttpServer()).get('/api/imports/2f1c9b2e-0000-4000-8000-000000000000'),
      );

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('reports the run that was committed, not the one the preview guessed at', async () => {
      const preview = await previewOf();
      expect(preview.counts.realignedRows).toBe(0);

      await commit(preview.importId, { repair: true });
      const response = await authorised(
        request(app.getHttpServer()).get(`/api/imports/${preview.importId}`),
      );
      const committed = response.body as ImportPreviewDto;

      expect(committed.status).toBe('committed');
      expect(committed.counts.realignedRows).toBe(1);
      expect(committed.counts.fieldsQuarantined).toBe(preview.countsWithRepair.fieldsQuarantined);
    });

    it('lists the recent runs, newest first', async () => {
      const first = await previewOf();
      const second = await previewOf();

      const response = await authorised(request(app.getHttpServer()).get('/api/imports'));
      const list = response.body as ImportRunListDto;

      expect(response.status).toBe(200);
      expect(list.runs.map((run) => run.importId)).toEqual([second.importId, first.importId]);
      expect(list.runs[0].status).toBe('previewed');
    });
  });

  describe('POST /api/imports/:importId/commit', () => {
    it('writes the previewed profiles to the corpus and the index', async () => {
      const preview = await previewOf();

      const response = await commit(preview.importId);
      const result = response.body as CommitResultDto;

      expect(response.status).toBe(200);
      expect(result.importId).toBe(preview.importId);
      expect(result.committed).toEqual({
        profilesInserted: 2,
        profilesUpdated: 0,
        indexed: 2,
        indexFailures: [],
      });
      expect([...profiles.profiles.keys()].sort()).toEqual(['joeyholland', 'tsmartin']);
      expect(search.indexed).toHaveLength(2);
    });

    it('defaults to leaving scrambled values quarantined when the body says nothing', async () => {
      const preview = await previewOf();

      await commit(preview.importId);

      expect(profiles.profiles.get('tsmartin')?.skills ?? []).toEqual([]);
    });

    it('applies the realignment when the body asks for it', async () => {
      const preview = await previewOf();

      await commit(preview.importId, { repair: true });

      const repaired = profiles.profiles.get('tsmartin');
      expect(repaired?.skills).toHaveLength(50);
      expect(repaired?.quality.repaired).toBe(true);
    });

    it.each([
      ['a repair flag that is not a boolean', { repair: 'yes' }, 'repair'],
      ['a field the endpoint does not accept', { repair: true, force: true }, 'force'],
    ])('rejects %s with a 400 naming it', async (_label, body, field) => {
      const preview = await previewOf();

      const response = await commit(preview.importId, body);

      expect(response.status).toBe(400);
      expect(asProblem(response.body).errors?.[field]).toBeDefined();
      expect(profiles.profiles.size).toBe(0);
    });

    it('answers 404 for an import nobody uploaded', async () => {
      const response = await commit('2f1c9b2e-0000-4000-8000-000000000000', { repair: false });

      expect(response.status).toBe(404);
      expect(asProblem(response.body).detail).toContain('2f1c9b2e');
    });

    it('refuses to commit the same import twice', async () => {
      const preview = await previewOf();
      await commit(preview.importId);

      const second = await commit(preview.importId);

      expect(second.status).toBe(409);
      expect(asProblem(second.body).detail).toContain('already been committed');
      expect(search.indexed).toHaveLength(2);
    });

    it('refuses a preview that has expired, and records that it has', async () => {
      const preview = await previewOf();
      sessions.setExpiresAt(preview.importId, new Date(Date.now() - 1000));

      const response = await commit(preview.importId);

      expect(response.status).toBe(409);
      expect(asProblem(response.body).detail).toContain('upload it again');
      expect((await sessions.findById(preview.importId))?.status).toBe('expired');
      expect(profiles.profiles.size).toBe(0);
    });

    it('keeps the corpus and reports the failure when the index is unreachable', async () => {
      const preview = await previewOf();
      search.unavailable = new Error('connect ECONNREFUSED 127.0.0.1:9200');

      const response = await commit(preview.importId);
      const result = response.body as CommitResultDto;

      expect(response.status).toBe(200);
      expect(result.committed.indexed).toBe(0);
      expect(result.committed.indexFailures[0]).toContain('indexing unavailable');
      expect(profiles.profiles.size).toBe(2);
    });
  });
});
