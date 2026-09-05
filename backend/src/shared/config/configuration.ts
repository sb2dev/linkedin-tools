/** The only file that reads process.env. Bad values fail at boot, all of them listed at once. */

export type NodeEnv = 'development' | 'test' | 'production';

export interface DatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly name: string;
}

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly database: DatabaseConfig;
  readonly elasticsearch: { readonly node: string; readonly index: string };
  readonly jwt: { readonly secret: string; readonly expiresIn: string };
  readonly upload: { readonly maxBytes: number };
  /** The password is a bcrypt hash; the plaintext never exists in the process. */
  readonly admin: { readonly username: string; readonly passwordHash: string };
  readonly cors: { readonly origins: readonly string[] };
}

class ConfigurationError extends Error {
  constructor(problems: readonly string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigurationError';
  }
}

type Env = Readonly<Record<string, string | undefined>>;

const NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'production'];
const TCP_PORT = { min: 1, max: 65_535 } as const;

const DEV_JWT_SECRET = 'development-only-jwt-secret';
/** bcrypt of "admin". */
const DEV_ADMIN_PASSWORD_HASH = '$2a$10$AGcTPfSVwUrW07mgypq1Fu6CejEZPvl2Meg34WpkPw39iya5f7poS';

/** .env.example ships these, so a deployment that copies it must not start on them. */
const PUBLISHED_SECRETS = new Set([DEV_JWT_SECRET, DEV_ADMIN_PASSWORD_HASH]);

export function loadConfiguration(env: Env = process.env): AppConfig {
  const reader = new EnvReader(env);
  const nodeEnv = reader.oneOf<NodeEnv>('NODE_ENV', NODE_ENVS, 'development');

  const config: AppConfig = {
    nodeEnv,
    port: reader.integer('PORT', 3100, TCP_PORT),
    database: readDatabase(reader),
    elasticsearch: {
      node: reader.text('ELASTICSEARCH_NODE', 'http://localhost:9200'),
      index: reader.text('ELASTICSEARCH_INDEX', 'profiles'),
    },
    jwt: {
      secret: reader.secret('JWT_SECRET', DEV_JWT_SECRET, nodeEnv),
      expiresIn: reader.text('JWT_EXPIRES_IN', '12h'),
    },
    upload: {
      maxBytes: reader.integer('UPLOAD_MAX_BYTES', 32 * 1024 * 1024, { min: 1, max: 512 * 1024 * 1024 }),
    },
    admin: {
      username: reader.text('ADMIN_USERNAME', 'admin'),
      passwordHash: reader.secret('ADMIN_PASSWORD_HASH', DEV_ADMIN_PASSWORD_HASH, nodeEnv),
    },
    cors: { origins: reader.list('CORS_ORIGINS', ['http://localhost:5173']) },
  };

  reader.verify();
  return config;
}

/** The migration CLI needs the database section and nothing else. */
export function loadDatabaseConfig(env: Env = process.env): DatabaseConfig {
  const reader = new EnvReader(env);
  const database = readDatabase(reader);
  reader.verify();
  return database;
}

function readDatabase(reader: EnvReader): DatabaseConfig {
  return {
    host: reader.text('DATABASE_HOST', 'localhost'),
    // 5433, not 5432: a system PostgreSQL usually holds 5432, and the README starts a private
    // cluster for this project beside it rather than asking anyone to move theirs.
    port: reader.integer('DATABASE_PORT', 5433, TCP_PORT),
    user: reader.text('DATABASE_USER', 'linkedin'),
    password: reader.text('DATABASE_PASSWORD', 'linkedin'),
    name: reader.text('DATABASE_NAME', 'linkedin'),
  };
}

class EnvReader {
  private readonly problems: string[] = [];

  constructor(private readonly env: Env) {}

  text(name: string, fallback: string): string {
    return this.env[name]?.trim() || fallback;
  }

  secret(name: string, developmentFallback: string, nodeEnv: NodeEnv): string {
    const raw = this.env[name]?.trim();
    const inProduction = nodeEnv === 'production';

    if (!raw) {
      if (inProduction) this.problems.push(`${name} must be set when NODE_ENV=production`);
      return developmentFallback;
    }
    if (inProduction && PUBLISHED_SECRETS.has(raw)) {
      this.problems.push(`${name} must not be the development value when NODE_ENV=production`);
      return developmentFallback;
    }
    return raw;
  }

  integer(name: string, fallback: number, bounds: { min: number; max: number }): number {
    const raw = this.env[name]?.trim();
    if (!raw) return fallback;

    const value = Number(raw);
    if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
      this.problems.push(`${name} must be a whole number between ${bounds.min} and ${bounds.max} (received "${raw}")`);
      return fallback;
    }
    return value;
  }

  oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
    const raw = this.env[name]?.trim();
    if (!raw) return fallback;

    if (!allowed.includes(raw as T)) {
      this.problems.push(`${name} must be one of ${allowed.join(', ')} (received "${raw}")`);
      return fallback;
    }
    return raw as T;
  }

  list(name: string, fallback: readonly string[]): readonly string[] {
    const raw = this.env[name]?.trim();
    if (!raw) return fallback;

    const values = raw.split(',').map((value) => value.trim()).filter((value) => value.length > 0);
    if (values.length === 0) {
      this.problems.push(`${name} must be a comma-separated list with at least one entry`);
      return fallback;
    }
    return values;
  }

  verify(): void {
    if (this.problems.length > 0) throw new ConfigurationError(this.problems);
  }
}
