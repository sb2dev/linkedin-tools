/**
 * Every module in the graph, compiled. A module that names a provider nobody supplies, or binds a
 * port to nothing, fails here rather than at the first request that needs it. Nothing connects: the
 * DataSource is offline and the Elasticsearch client is never asked to talk.
 */

import { DataSource } from 'typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppModule } from './app.module';
import { AuthModule } from './auth/auth.module';
import { AuthService } from './auth/application/auth.service';
import { ImportsModule } from './imports/imports.module';
import { CommitImportUseCase } from './imports/application/commit-import.use-case';
import { DATASET_READER } from './imports/domain/ports/dataset-reader.port';
import { IMPORT_SESSION_REPOSITORY } from './imports/domain/ports/import-session-repository.port';
import { ImportsPersistenceModule } from './imports/infrastructure/persistence/imports-persistence.module';
import { ProfilesModule } from './profiles/profiles.module';
import { SearchProfilesUseCase } from './profiles/application/search-profiles.use-case';
import { PROFILE_REPOSITORY } from './profiles/domain/ports/profile-repository.port';
import { PROFILE_SEARCH } from './profiles/domain/ports/profile-search.port';
import { PersistenceModule } from './profiles/infrastructure/persistence/persistence.module';
import { ElasticsearchModule } from './profiles/infrastructure/search/elasticsearch.module';
import { AppConfigModule } from './shared/config/app-config.module';
import { AppConfigService } from './shared/config/app-config.service';
import { DatabaseModule } from './shared/config/database.module';
import { SharedModule } from './shared/shared.module';
import { HealthController } from './shared/http/health.controller';
import { createOfflineDataSource, offlineDataSourceModule } from './test/nest/offline-data-source';
import { clusterIsAvailable, createDatabase } from './test/postgres/cluster';
import { testConfig } from './test/http/auth';

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = await createOfflineDataSource();
});

/** Compiles a module with the real config, but with the database replaced by an offline one. */
async function compile(target: unknown): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      AppConfigModule,
      // Both of these are global in the real graph, so a module compiled alone still needs them:
      // AuthModule for the guards on the controllers, the throttler for the rate-limited routes.
      AuthModule,
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
      offlineDataSourceModule(dataSource),
      target as never,
    ],
  })
    .overrideModule(DatabaseModule)
    .useModule(offlineDataSourceModule(dataSource))
    .compile();

  return moduleRef;
}

describe('the module graph', () => {
  afterEach(async () => {
    await ConfigModule.envVariablesLoaded;
  });

  it('binds PROFILE_SEARCH to an adapter', async () => {
    const moduleRef = await compile(ElasticsearchModule);

    expect(moduleRef.get(PROFILE_SEARCH)).toBeDefined();
    await moduleRef.close();
  });

  it('binds PROFILE_REPOSITORY to an adapter', async () => {
    const moduleRef = await compile(PersistenceModule);

    expect(moduleRef.get(PROFILE_REPOSITORY)).toBeDefined();
    await moduleRef.close();
  });

  it('binds IMPORT_SESSION_REPOSITORY to an adapter', async () => {
    const moduleRef = await compile(ImportsPersistenceModule);

    expect(moduleRef.get(IMPORT_SESSION_REPOSITORY)).toBeDefined();
    await moduleRef.close();
  });

  it('resolves the search use case, so ProfilesModule reaches both ports', async () => {
    const moduleRef = await compile(ProfilesModule);

    expect(moduleRef.get(SearchProfilesUseCase)).toBeInstanceOf(SearchProfilesUseCase);
    await moduleRef.close();
  });

  it('resolves the commit use case, which needs the reader and both stores at once', async () => {
    const moduleRef = await compile(ImportsModule);

    expect(moduleRef.get(CommitImportUseCase)).toBeInstanceOf(CommitImportUseCase);
    expect(moduleRef.get(DATASET_READER)).toBeDefined();
    await moduleRef.close();
  });

  it('resolves AuthService, and exports it globally so the guards reach it', async () => {
    const moduleRef = await compile(AuthModule);

    expect(moduleRef.get(AuthService)).toBeInstanceOf(AuthService);
    await moduleRef.close();
  });

  it('resolves the health controller, which injects both ports', async () => {
    const moduleRef = await compile(SharedModule);

    expect(moduleRef.get(HealthController)).toBeInstanceOf(HealthController);
    await moduleRef.close();
  });

  it('exposes the validated configuration as a typed service', async () => {
    const moduleRef = await compile(AppConfigModule);

    expect(moduleRef.get(AppConfigService).port).toBeGreaterThan(0);
    await moduleRef.close();
  });

  it('compiles the whole application graph', async () => {
    const moduleRef = await compile(AppModule);

    expect(moduleRef.get(SearchProfilesUseCase)).toBeDefined();
    expect(moduleRef.get(CommitImportUseCase)).toBeDefined();
    expect(moduleRef.get(AuthService)).toBeDefined();
    await moduleRef.close();
  });
});

/** The one place the real connection factory runs, against a database this spec makes itself. */
(clusterIsAvailable() ? describe : describe.skip)('DatabaseModule', () => {
  const DATABASE = 'linkedin_spec_databasemodule';
  let drop: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    drop = await createDatabase(DATABASE);
  }, 60_000);

  afterAll(async () => {
    await drop?.();
  }, 60_000);

  it('opens a pool against the database the configuration names', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppConfigModule, DatabaseModule] })
      .overrideProvider(AppConfigService)
      .useValue(testConfig({ DATABASE_NAME: DATABASE }))
      .compile();

    const opened = moduleRef.get(DataSource);
    expect(opened.options.database).toBe(DATABASE);
    expect(opened.isInitialized).toBe(true);
    await moduleRef.close();
  }, 60_000);
});
