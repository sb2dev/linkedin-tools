/** The corpus view and the one way to empty it, both behind the import token. */

import type { INestApplication } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { PROFILE_REPOSITORY } from 'src/profiles/domain/ports/profile-repository.port';
import { PROFILE_SEARCH } from 'src/profiles/domain/ports/profile-search.port';
import { IMPORT_SESSION_REPOSITORY } from '../../domain/ports/import-session-repository.port';
import { DescribeCorpusUseCase } from '../../application/describe-corpus.use-case';
import { PURGE_CONFIRMATION, PurgeCorpusUseCase } from '../../application/purge-corpus.use-case';
import { asProblem, createHttpApp } from 'src/test/http/app';
import { authWiring, bearerToken, expiredToken } from 'src/test/http/auth';
import {
  FakeImportSessionRepository,
  FakeProfileRepository,
  FakeProfileSearch,
  corpus,
} from 'src/test/fakes';
import { CorpusAdminController } from './admin.controller';

describe('/api/admin/corpus', () => {
  let app: INestApplication;
  let repository: FakeProfileRepository;
  let search: FakeProfileSearch;
  let journal: string[];

  beforeEach(async () => {
    journal = [];
    repository = new FakeProfileRepository(corpus(6), journal);
    search = new FakeProfileSearch(journal);
    const sessions = new FakeImportSessionRepository(journal);
    const wiring = authWiring();

    app = await createHttpApp({
      imports: [...wiring.imports, ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
      controllers: [CorpusAdminController],
      providers: [
        ...wiring.providers,
        DescribeCorpusUseCase,
        PurgeCorpusUseCase,
        { provide: PROFILE_REPOSITORY, useValue: repository },
        { provide: PROFILE_SEARCH, useValue: search },
        { provide: IMPORT_SESSION_REPOSITORY, useValue: sessions },
      ],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET', () => {
    it('reports what the corpus holds', async () => {
      const token = await bearerToken(app);

      const response = await request(app.getHttpServer())
        .get('/api/admin/corpus')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({ profiles: 6 });
    });

    it('refuses an anonymous caller', async () => {
      await request(app.getHttpServer()).get('/api/admin/corpus').expect(401);
    });
  });

  describe('POST purge', () => {
    it('deletes every profile when the phrase is exact', async () => {
      const token = await bearerToken(app);

      const response = await request(app.getHttpServer())
        .post('/api/admin/corpus/purge')
        .set('Authorization', `Bearer ${token}`)
        .send({ confirm: PURGE_CONFIRMATION })
        .expect(200);

      expect(response.body).toEqual({
        profilesDeleted: 6,
        indexCleared: true,
        importHistoryRetained: true,
      });
      expect(await repository.count()).toBe(0);
    });

    it('answers 400 naming the phrase when the confirmation is wrong, and deletes nothing', async () => {
      const token = await bearerToken(app);

      const response = await request(app.getHttpServer())
        .post('/api/admin/corpus/purge')
        .set('Authorization', `Bearer ${token}`)
        .send({ confirm: 'please' })
        .expect(400);

      expect(asProblem(response.body).detail).toContain(PURGE_CONFIRMATION);
      expect(await repository.count()).toBe(6);
    });

    it('rejects a body with no confirm field at all', async () => {
      const token = await bearerToken(app);

      const response = await request(app.getHttpServer())
        .post('/api/admin/corpus/purge')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(asProblem(response.body).errors).toHaveProperty('confirm');
    });

    it('rejects an unknown field rather than ignoring it', async () => {
      const token = await bearerToken(app);

      await request(app.getHttpServer())
        .post('/api/admin/corpus/purge')
        .set('Authorization', `Bearer ${token}`)
        .send({ confirm: PURGE_CONFIRMATION, force: true })
        .expect(400);

      expect(await repository.count()).toBe(6);
    });

    it('refuses an expired token before it counts anything', async () => {
      const token = await expiredToken(app);

      await request(app.getHttpServer())
        .post('/api/admin/corpus/purge')
        .set('Authorization', `Bearer ${token}`)
        .send({ confirm: PURGE_CONFIRMATION })
        .expect(401);

      expect(journal).toEqual([]);
    });

    it('does not dress an unreachable database as a bad request', async () => {
      jest.spyOn(repository, 'deleteAll').mockRejectedValue(new Error('connection terminated'));
      const token = await bearerToken(app);

      const response = await request(app.getHttpServer())
        .post('/api/admin/corpus/purge')
        .set('Authorization', `Bearer ${token}`)
        .send({ confirm: PURGE_CONFIRMATION })
        .expect(500);

      // The problem-details filter answers a flat 500; the database message never reaches the wire.
      expect(asProblem(response.body).detail).toBe('An unexpected error occurred');
    });

    it('still answers 200 when the corpus emptied but the index did not', async () => {
      search.unavailable = new Error('cluster down');
      const token = await bearerToken(app);

      const response = await request(app.getHttpServer())
        .post('/api/admin/corpus/purge')
        .set('Authorization', `Bearer ${token}`)
        .send({ confirm: PURGE_CONFIRMATION })
        .expect(200);

      expect(response.body).toMatchObject({ indexCleared: false, indexError: 'cluster down' });
    });
  });
});
