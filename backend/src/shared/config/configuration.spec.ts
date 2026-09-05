/**
 * The only file that reads process.env. Every default here is a decision, and a bad value has to
 * fail at boot with its own name in the message rather than surface as a connection error later.
 */

import { loadConfiguration, loadDatabaseConfig } from './configuration';

const DEV_HASH = '$2a$10$AGcTPfSVwUrW07mgypq1Fu6CejEZPvl2Meg34WpkPw39iya5f7poS';

/** A production environment with every secret supplied, so a spec can vary one at a time. */
function production(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'production',
    JWT_SECRET: 'a-real-secret',
    ADMIN_PASSWORD_HASH: '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012',
    ...overrides,
  };
}

describe('loadConfiguration', () => {
  it('runs on defaults with an empty environment', () => {
    const config = loadConfiguration({});

    expect(config).toMatchObject({
      nodeEnv: 'development',
      port: 3100,
      elasticsearch: { node: 'http://localhost:9200', index: 'profiles' },
      admin: { username: 'admin' },
    });
  });

  it('defaults the database to the private cluster the README starts, not to 5432', () => {
    expect(loadConfiguration({}).database).toEqual({
      host: 'localhost',
      port: 5433,
      user: 'linkedin',
      password: 'linkedin',
      name: 'linkedin',
    });
  });

  it('reads every value the environment does supply', () => {
    const config = loadConfiguration({
      NODE_ENV: 'test',
      PORT: '4000',
      DATABASE_HOST: 'db',
      DATABASE_PORT: '6000',
      DATABASE_USER: 'u',
      DATABASE_PASSWORD: 'p',
      DATABASE_NAME: 'n',
      ELASTICSEARCH_NODE: 'http://es:9200',
      ELASTICSEARCH_INDEX: 'people',
      JWT_EXPIRES_IN: '30m',
      UPLOAD_MAX_BYTES: '1024',
      ADMIN_USERNAME: 'operator',
      CORS_ORIGINS: 'http://a.test, http://b.test',
    });

    expect(config).toMatchObject({
      nodeEnv: 'test',
      port: 4000,
      database: { host: 'db', port: 6000, user: 'u', password: 'p', name: 'n' },
      elasticsearch: { node: 'http://es:9200', index: 'people' },
      jwt: { expiresIn: '30m' },
      upload: { maxBytes: 1024 },
      admin: { username: 'operator' },
      cors: { origins: ['http://a.test', 'http://b.test'] },
    });
  });

  it('treats a blank value as unset rather than as an empty string', () => {
    expect(loadConfiguration({ DATABASE_HOST: '   ' }).database.host).toBe('localhost');
  });

  it('names the variable when a port is not a whole number in range', () => {
    expect(() => loadConfiguration({ PORT: 'http' })).toThrow('PORT must be a whole number');
    expect(() => loadConfiguration({ PORT: '0' })).toThrow('PORT');
    expect(() => loadConfiguration({ PORT: '70000' })).toThrow('PORT');
    expect(() => loadConfiguration({ PORT: '3100.5' })).toThrow('PORT');
  });

  it('names the variable when NODE_ENV is not one of the three', () => {
    expect(() => loadConfiguration({ NODE_ENV: 'staging' })).toThrow(
      'NODE_ENV must be one of development, test, production',
    );
  });

  it('rejects a CORS list that holds nothing but separators', () => {
    expect(() => loadConfiguration({ CORS_ORIGINS: ' , , ' })).toThrow('CORS_ORIGINS');
  });

  it('reports every problem at once rather than stopping at the first', () => {
    const read = () => loadConfiguration({ PORT: 'x', NODE_ENV: 'staging', UPLOAD_MAX_BYTES: '-1' });

    expect(read).toThrow('PORT');
    expect(read).toThrow('NODE_ENV');
    expect(read).toThrow('UPLOAD_MAX_BYTES');
  });

  describe('secrets', () => {
    it('falls back to the development values outside production', () => {
      const config = loadConfiguration({});

      expect(config.jwt.secret).toBe('development-only-jwt-secret');
      expect(config.admin.passwordHash).toBe(DEV_HASH);
    });

    it('demands both secrets when NODE_ENV=production', () => {
      expect(() => loadConfiguration({ NODE_ENV: 'production' })).toThrow(
        'JWT_SECRET must be set when NODE_ENV=production',
      );
      expect(() => loadConfiguration({ NODE_ENV: 'production' })).toThrow('ADMIN_PASSWORD_HASH');
    });

    it('refuses the published development values in production, set explicitly', () => {
      expect(() => loadConfiguration(production({ JWT_SECRET: 'development-only-jwt-secret' }))).toThrow(
        'JWT_SECRET must not be the development value',
      );
      expect(() => loadConfiguration(production({ ADMIN_PASSWORD_HASH: DEV_HASH }))).toThrow(
        'ADMIN_PASSWORD_HASH must not be the development value',
      );
    });

    it('accepts real secrets in production', () => {
      const config = loadConfiguration(production());

      expect(config.jwt.secret).toBe('a-real-secret');
      expect(config.nodeEnv).toBe('production');
    });
  });
});

describe('reading the real process environment', () => {
  const original = process.env;

  afterEach(() => {
    process.env = original;
  });

  it('falls back to process.env when no environment is passed', () => {
    process.env = { NODE_ENV: 'test', PORT: '4321' };

    expect(loadConfiguration().port).toBe(4321);
  });

  it('does the same for the database section the migration CLI reads', () => {
    process.env = { DATABASE_NAME: 'from-the-process' };

    expect(loadDatabaseConfig().name).toBe('from-the-process');
  });
});

describe('loadDatabaseConfig', () => {
  it('reads the database section alone, so the migration CLI needs no JWT secret', () => {
    expect(loadDatabaseConfig({ NODE_ENV: 'production', DATABASE_HOST: 'db' })).toEqual({
      host: 'db',
      port: 5433,
      user: 'linkedin',
      password: 'linkedin',
      name: 'linkedin',
    });
  });

  it('still validates what it does read', () => {
    expect(() => loadDatabaseConfig({ DATABASE_PORT: 'nope' })).toThrow('DATABASE_PORT');
  });
});
