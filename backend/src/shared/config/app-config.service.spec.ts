import { ConfigService } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { loadConfiguration } from './configuration';

function serviceFor(env: Record<string, string> = {}): AppConfigService {
  return new AppConfigService(new ConfigService({ ...loadConfiguration(env) }));
}

describe('AppConfigService', () => {
  it('exposes every section the application injects', () => {
    const config = serviceFor();

    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3100);
    expect(config.database).toMatchObject({ host: 'localhost', port: 5433 });
    expect(config.elasticsearch).toEqual({ node: 'http://localhost:9200', index: 'profiles' });
    expect(config.jwt).toMatchObject({ expiresIn: '12h' });
    expect(config.upload).toEqual({ maxBytes: 32 * 1024 * 1024 });
    expect(config.admin.username).toBe('admin');
    expect(config.cors).toEqual({ origins: ['http://localhost:5173'] });
  });

  it('answers isProduction only for production', () => {
    expect(serviceFor().isProduction).toBe(false);
    expect(serviceFor({ NODE_ENV: 'test' }).isProduction).toBe(false);
    expect(
      serviceFor({
        NODE_ENV: 'production',
        JWT_SECRET: 'real',
        ADMIN_PASSWORD_HASH: '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012',
      }).isProduction,
    ).toBe(true);
  });

  it('throws for a key the configuration never loaded, rather than answering undefined', () => {
    const source = new ConfigService({});

    expect(() => new AppConfigService(source)).toThrow();
  });
});
