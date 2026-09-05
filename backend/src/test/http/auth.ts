/**
 * The operator account the HTTP specs authenticate as. loadConfiguration's development defaults are
 * a real bcrypt hash of "admin", so nothing here has to invent a credential the service would then
 * be asked to trust.
 */

import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import type { DynamicModule, INestApplication, Provider } from '@nestjs/common';
import { AuthService } from 'src/auth/application/auth.service';
import { AppConfigService } from 'src/shared/config/app-config.service';
import { loadConfiguration } from 'src/shared/config/configuration';

export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = 'admin';

export function testConfig(env: Readonly<Record<string, string>> = {}): AppConfigService {
  const source: ConfigService = new ConfigService({ ...loadConfiguration(env) });
  return new AppConfigService(source);
}

/** Everything a module needs to resolve JwtAuthGuard and OptionalJwtGuard. */
export function authWiring(config: AppConfigService = testConfig()): {
  imports: DynamicModule[];
  providers: Provider[];
} {
  return {
    imports: [JwtModule.register({ secret: config.jwt.secret })],
    providers: [AuthService, { provide: AppConfigService, useValue: config }],
  };
}

export async function bearerToken(app: INestApplication, username = ADMIN_USERNAME): Promise<string> {
  const jwt = app.get(JwtService);
  return jwt.signAsync({ sub: username });
}

/** A token that is well formed and correctly signed, but whose lifetime has already run out. */
export async function expiredToken(app: INestApplication): Promise<string> {
  const jwt = app.get(JwtService);
  return jwt.signAsync({ sub: ADMIN_USERNAME }, { expiresIn: -60 });
}
