import type { INestApplication } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AuthService } from 'src/auth/application/auth.service';
import { AppConfigService } from 'src/shared/config/app-config.service';
import { ADMIN_PASSWORD, ADMIN_USERNAME, authWiring, testConfig } from 'src/test/http/auth';
import { asProblem, createHttpApp } from 'src/test/http/app';
import { AccessTokenDto } from './dto/access-token.dto';
import { AuthController } from './auth.controller';

const goodCredentials = { username: ADMIN_USERNAME, password: ADMIN_PASSWORD };

describe('POST /api/auth/login', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const config = testConfig({ JWT_EXPIRES_IN: '45m' });
    const wiring = authWiring(config);
    app = await createHttpApp({
      imports: [...wiring.imports, ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
      controllers: [AuthController],
      providers: wiring.providers,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const login = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/api/auth/login').send(body);

  it('answers 200 with the token, its lifetime in seconds and the caller it names', async () => {
    const response = await login(goodCredentials);
    const body = response.body as AccessTokenDto;

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['accessToken', 'expiresIn', 'username']);
    expect(body.expiresIn).toBe(2700);
    expect(body.username).toBe(ADMIN_USERNAME);
    await expect(app.get(AuthService).verify(body.accessToken)).resolves.toEqual({
      username: ADMIN_USERNAME,
    });
  });

  it.each([
    ['a wrong password', { username: ADMIN_USERNAME, password: 'hunter2' }],
    ['an unknown username', { username: 'someone-else', password: ADMIN_PASSWORD }],
    ['both wrong', { username: 'someone-else', password: 'hunter2' }],
  ])('refuses %s with the same 401 and the same wording', async (_label, credentials) => {
    const response = await login(credentials);

    expect(response.status).toBe(401);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(asProblem(response.body)).toMatchObject({
      title: 'Unauthorized',
      detail: 'Invalid username or password',
    });
    expect(JSON.stringify(response.body)).not.toContain('accessToken');
  });

  it('never says whether the username exists', async () => {
    const unknownUser = await login({ username: 'someone-else', password: ADMIN_PASSWORD });
    const wrongPassword = await login({ username: ADMIN_USERNAME, password: 'hunter2' });

    expect(asProblem(unknownUser.body).detail).toBe(asProblem(wrongPassword.body).detail);
    expect(unknownUser.status).toBe(wrongPassword.status);
  });

  it.each([
    ['no body at all', {}, ['password', 'username']],
    ['no password', { username: ADMIN_USERNAME }, ['password']],
    ['an empty password', { username: ADMIN_USERNAME, password: '' }, ['password']],
    ['a username that is not text', { username: 42, password: ADMIN_PASSWORD }, ['username']],
  ])('rejects %s as a 400 naming the field', async (_label, body, expectedFields) => {
    const response = await login(body);

    expect(response.status).toBe(400);
    expect(asProblem(response.body).detail).toBe('One or more fields are invalid');
    expect(Object.keys(asProblem(response.body).errors ?? {}).sort()).toEqual(expectedFields);
  });

  it('refuses an over-long password rather than hashing whatever it is sent', async () => {
    const response = await login({ username: ADMIN_USERNAME, password: 'x'.repeat(201) });

    expect(response.status).toBe(400);
    expect(asProblem(response.body).errors?.password).toBeDefined();
  });

  it('refuses a body carrying fields the endpoint does not accept', async () => {
    const response = await login({ ...goodCredentials, role: 'superuser' });

    expect(response.status).toBe(400);
    expect(asProblem(response.body).errors?.role).toBeDefined();
  });

  it('stops guessing after five attempts a minute', async () => {
    const attempts = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      attempts.push(await login({ username: ADMIN_USERNAME, password: `guess-${attempt}` }));
    }

    expect(attempts.slice(0, 5).map((response) => response.status)).toEqual([
      401, 401, 401, 401, 401,
    ]);
    expect(attempts[5].status).toBe(429);
    expect(attempts[5].headers['content-type']).toMatch(/application\/problem\+json/);
    expect(asProblem(attempts[5].body).title).toBe('Too many requests');
  });

  it('counts a successful login against the same allowance', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await login(goodCredentials);

    await expect(login(goodCredentials).then((response) => response.status)).resolves.toBe(429);
  });
});

describe('a login that fails for a reason that is not the credentials', () => {
  it('answers 500 and does not call a misconfiguration a wrong password', async () => {
    const config = testConfig();
    const app = await createHttpApp({
      imports: [
        JwtModule.register({ secret: config.jwt.secret, signOptions: { algorithm: 'RS256' } }),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
      ],
      controllers: [AuthController],
      providers: [AuthService, { provide: AppConfigService, useValue: config }],
    });

    try {
      const response = await request(app.getHttpServer()).post('/api/auth/login').send(goodCredentials);

      expect(response.status).toBe(500);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(asProblem(response.body).detail).toBe('An unexpected error occurred');
      expect(JSON.stringify(response.body)).not.toContain('secretOrPrivateKey');
    } finally {
      await app.close();
    }
  });
});
