/** The probe an orchestrator polls. */

import { Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PROFILE_REPOSITORY } from 'src/profiles/domain/ports/profile-repository.port';
import { PROFILE_SEARCH } from 'src/profiles/domain/ports/profile-search.port';
import { createHttpApp } from 'src/test/http/app';
import { FakeProfileRepository, FakeProfileSearch, aProfile } from 'src/test/fakes';
import { HealthController, HealthResponseDto } from './health.controller';

describe('GET /api/health', () => {
  let app: INestApplication;
  let profiles: FakeProfileRepository;
  let search: FakeProfileSearch;

  beforeEach(async () => {
    profiles = new FakeProfileRepository([aProfile('ada-lovelace'), aProfile('alan-turing')]);
    search = new FakeProfileSearch();
    app = await createHttpApp({
      controllers: [HealthController],
      providers: [
        { provide: PROFILE_REPOSITORY, useValue: profiles },
        { provide: PROFILE_SEARCH, useValue: search },
      ],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const check = async (): Promise<{ status: number; body: HealthResponseDto }> => {
    const response = await request(app.getHttpServer()).get('/api/health');
    return { status: response.status, body: response.body as HealthResponseDto };
  };

  it('reports both dependencies and how many profiles the corpus holds', async () => {
    const { status, body } = await check();

    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok', postgres: true, search: true, profiles: 2 });
  });

  it('really asks each dependency rather than reporting a cached opinion', async () => {
    await check();

    expect(search.suggestCalls).toHaveLength(1);
    expect(search.suggestCalls[0].limit).toBe(1);
  });

  it('answers 200 and degraded when the database is unreachable', async () => {
    profiles.unavailable = new Error('connect ECONNREFUSED 127.0.0.1:5433');

    const { status, body } = await check();

    expect(status).toBe(200);
    expect(body).toEqual({
      status: 'degraded',
      postgres: false,
      search: true,
      profiles: 0,
    });
  });

  it('answers 200 and degraded when the search cluster is unreachable', async () => {
    search.unavailable = new Error('connect ECONNREFUSED 127.0.0.1:9200');

    const { status, body } = await check();

    expect(status).toBe(200);
    expect(body).toMatchObject({ status: 'degraded', postgres: true, search: false });
    expect(body.profiles).toBe(2);
  });

  it('still answers 200 when nothing is reachable at all', async () => {
    profiles.unavailable = new Error('no database');
    search.unavailable = new Error('no cluster');

    const { status, body } = await check();

    expect(status).toBe(200);
    expect(body).toEqual({
      status: 'degraded',
      postgres: false,
      search: false,
      profiles: 0,
    });
  });

  it('probes the cluster even when the database has already failed', async () => {
    profiles.unavailable = new Error('no database');

    await check();

    expect(search.suggestCalls).toHaveLength(1);
  });

  it('leaks no connection string or driver message to the caller', async () => {
    profiles.unavailable = new Error('password authentication failed for user "linkedin"');
    search.unavailable = new Error('http://localhost:9200 refused the connection');

    const { body } = await check();

    expect(JSON.stringify(body)).not.toContain('password');
    expect(JSON.stringify(body)).not.toContain('9200');
  });
});

describe('a dependency that fails with something that is not an Error', () => {
  /** A client that rejects with a string, which is what a torn-down socket can look like. */
  class SearchThatRejectsWithAString extends FakeProfileSearch {
    async suggest(): Promise<never> {
      throw 'socket hang up';
    }
  }

  it('reports it as degraded and still says what went wrong in the log', async () => {
    const warnings: unknown[] = [];
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((...args: unknown[]) => void warnings.push(args[0]));

    const app = await createHttpApp({
      controllers: [HealthController],
      providers: [
        { provide: PROFILE_REPOSITORY, useValue: new FakeProfileRepository([aProfile('ada-lovelace')]) },
        { provide: PROFILE_SEARCH, useValue: new SearchThatRejectsWithAString() },
      ],
    });

    try {
      const response = await request(app.getHttpServer()).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'degraded', postgres: true, search: false, profiles: 1 });
      expect(warnings).toEqual(['The search driver is unreachable: socket hang up']);
    } finally {
      warn.mockRestore();
      await app.close();
    }
  });
});
