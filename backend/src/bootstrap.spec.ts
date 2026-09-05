/**
 * The HTTP surface main.ts installs, asserted against a real server rather than read. Each of these
 * decides part of the contract for every route at once, so none of them is visible in a controller.
 */

import { Controller, Get, INestApplication, Logger, Post, Body } from '@nestjs/common';
import { IsInt, Min } from 'class-validator';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { API_PREFIX, configureApp, logStartup } from './bootstrap';
import { AppConfigModule } from './shared/config/app-config.module';
import { AppConfigService } from './shared/config/app-config.service';
import { testConfig } from './test/http/auth';

class PageDto {
  @IsInt()
  @Min(1)
  readonly page!: number;
}

@Controller('probe')
class ProbeController {
  @Get()
  read(): { ok: boolean } {
    return { ok: true };
  }

  @Get('boom')
  fail(): never {
    throw new Error('something the client must not see');
  }

  @Post()
  write(@Body() body: PageDto): PageDto {
    return body;
  }
}

async function bootWith(config: AppConfigService): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppConfigModule],
    controllers: [ProbeController],
  })
    .overrideProvider(AppConfigService)
    .useValue(config)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}

describe('configureApp', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app.close();
  });

  it('serves every route under the api prefix', async () => {
    app = await bootWith(testConfig());

    await request(app.getHttpServer()).get(`/${API_PREFIX}/probe`).expect(200, { ok: true });
    await request(app.getHttpServer()).get('/probe').expect(404);
  });

  it('returns the configuration it read, so main.ts does not resolve it twice', async () => {
    const config = testConfig({ PORT: '4242' });
    app = await bootWith(config);

    expect(configureApp(app).port).toBe(4242);
  });

  it('sets the security headers helmet installs', async () => {
    app = await bootWith(testConfig());

    const response = await request(app.getHttpServer()).get(`/${API_PREFIX}/probe`).expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-dns-prefetch-control']).toBe('off');
  });

  it('validates a body and reports the field at fault as problem+json', async () => {
    app = await bootWith(testConfig());

    const response = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/probe`)
      .send({ page: 0 })
      .expect(400);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect((response.body as { errors: Record<string, string[]> }).errors).toHaveProperty('page');
  });

  it('refuses a field the DTO never declared rather than silently dropping it', async () => {
    app = await bootWith(testConfig());

    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/probe`)
      .send({ page: 1, admin: true })
      .expect(400);
  });

  it('answers an unexpected failure with a flat 500 that leaks nothing', async () => {
    app = await bootWith(testConfig());

    const response = await request(app.getHttpServer()).get(`/${API_PREFIX}/probe/boom`).expect(500);

    expect(response.body).toMatchObject({ status: 500, detail: 'An unexpected error occurred' });
    expect(JSON.stringify(response.body)).not.toContain('must not see');
  });

  it('serves the API documentation outside production', async () => {
    app = await bootWith(testConfig());

    await request(app.getHttpServer()).get(`/${API_PREFIX}/docs-json`).expect(200);
  });

  it('serves no documentation in production', async () => {
    app = await bootWith(
      testConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'a-real-secret',
        ADMIN_PASSWORD_HASH: '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012',
      }),
    );

    await request(app.getHttpServer()).get(`/${API_PREFIX}/docs-json`).expect(404);
  });

  it('caps the JSON body, so a large POST is refused before a handler reads it', async () => {
    app = await bootWith(testConfig());

    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/probe`)
      .send({ page: 1, padding: 'x'.repeat(300 * 1024) })
      .expect(413);
  });
});

describe('logStartup', () => {
  it('names the port, the cluster and the upload cap', () => {
    const lines: string[] = [];
    const logger = { log: (message: string) => lines.push(message) } as unknown as Logger;

    logStartup(testConfig({ PORT: '3100' }), logger);

    expect(lines[0]).toContain('http://localhost:3100/api');
    expect(lines[1]).toContain('Elasticsearch http://localhost:9200');
    expect(lines[2]).toContain('32 MB');
    expect(lines[3]).toContain('/api/docs');
  });

  it('leaves the documentation line out in production', () => {
    const lines: string[] = [];
    const logger = { log: (message: string) => lines.push(message) } as unknown as Logger;

    logStartup(
      testConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'a-real-secret',
        ADMIN_PASSWORD_HASH: '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012',
      }),
      logger,
    );

    expect(lines).toHaveLength(3);
  });
});
