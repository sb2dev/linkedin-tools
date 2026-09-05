/** Reindexing is operator-only, and the guard has to run before the work does. */

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PROFILE_REPOSITORY } from '../../domain/ports/profile-repository.port';
import { PROFILE_SEARCH } from '../../domain/ports/profile-search.port';
import { ReindexUseCase } from '../../application/reindex.use-case';
import { createHttpApp } from 'src/test/http/app';
import { authWiring, bearerToken, expiredToken } from 'src/test/http/auth';
import { FakeProfileRepository, FakeProfileSearch, corpus } from 'src/test/fakes';
import { AdminController } from './admin.controller';

describe('POST /api/admin/reindex', () => {
  let app: INestApplication;
  let search: FakeProfileSearch;
  let journal: string[];

  beforeEach(async () => {
    journal = [];
    search = new FakeProfileSearch(journal);
    const repository = new FakeProfileRepository(corpus(4), journal);
    const wiring = authWiring();

    app = await createHttpApp({
      imports: wiring.imports,
      controllers: [AdminController],
      providers: [
        ...wiring.providers,
        ReindexUseCase,
        { provide: PROFILE_REPOSITORY, useValue: repository },
        { provide: PROFILE_SEARCH, useValue: search },
      ],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('rebuilds the index and reports what landed', async () => {
    const token = await bearerToken(app);

    const response = await request(app.getHttpServer())
      .post('/api/admin/reindex')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({ indexed: 4, failures: [] });
  });

  it('answers 200 rather than 201, because it creates no resource', async () => {
    const token = await bearerToken(app);

    await request(app.getHttpServer())
      .post('/api/admin/reindex')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('refuses an anonymous caller before it touches either store', async () => {
    await request(app.getHttpServer()).post('/api/admin/reindex').expect(401);

    expect(journal).toEqual([]);
  });

  it('refuses an expired token', async () => {
    const token = await expiredToken(app);

    await request(app.getHttpServer())
      .post('/api/admin/reindex')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(journal).toEqual([]);
  });

  it('reports the keys the index refused, so a partial rebuild is not read as a clean one', async () => {
    search.failFor.add('person-2');
    const token = await bearerToken(app);

    const response = await request(app.getHttpServer())
      .post('/api/admin/reindex')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      indexed: 3,
      failures: [expect.stringContaining('person-2')],
    });
  });
});
