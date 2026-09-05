/** Credential check and token issue for the single operator account, which is configuration, not a row. */

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { AppConfigService } from 'src/shared/config/app-config.service';
import { AppConfig } from 'src/shared/config/configuration';
import { AuthenticatedUser } from '../domain/authenticated-user';

/** Transport-free: AuthController maps it to 401 rather than the service knowing about HTTP. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid username or password');
    this.name = 'InvalidCredentialsError';
  }
}

export interface AccessToken {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly username: string;
}

interface TokenClaims {
  readonly sub: string;
}

const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const SECONDS_PER_UNIT: Readonly<Record<string, number>> = { s: 1, m: 60, h: 3600, d: 86_400 };

@Injectable()
export class AuthService {
  private readonly admin: AppConfig['admin'];
  private readonly ttlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    config: AppConfigService,
  ) {
    this.admin = config.admin;
    this.ttlSeconds = durationToSeconds(config.jwt.expiresIn);

    if (!BCRYPT_HASH.test(this.admin.passwordHash)) {
      throw new Error(
        `ADMIN_PASSWORD_HASH is not a bcrypt hash (received "${this.admin.passwordHash}"). ` +
          'A truncated value here usually means an unescaped $ in .env: compose interpolates that ' +
          'file, so each $ in the hash must be written $$.',
      );
    }
  }

  async login(username: string, password: string): Promise<AccessToken> {
    // Compared unconditionally, so a wrong username costs the same as a wrong password.
    const passwordMatches = await compare(password, this.admin.passwordHash);
    if (!passwordMatches || username !== this.admin.username) {
      throw new InvalidCredentialsError();
    }

    const accessToken = await this.jwt.signAsync({ sub: username }, { expiresIn: this.ttlSeconds });
    return { accessToken, expiresIn: this.ttlSeconds, username };
  }

  /** Null rather than a throw: the optional guard has to tell "no valid token" from "rejected". */
  async verify(token: string): Promise<AuthenticatedUser | null> {
    try {
      const claims = await this.jwt.verifyAsync<TokenClaims>(token);
      return { username: claims.sub };
    } catch {
      return null;
    }
  }
}

/** JWT_EXPIRES_IN is written the way jsonwebtoken accepts it; the login response reports seconds. */
function durationToSeconds(duration: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(duration.trim());
  if (!match) throw new Error(`JWT_EXPIRES_IN must look like "3600", "30m" or "12h", received "${duration}"`);
  return Number(match[1]) * (match[2] ? SECONDS_PER_UNIT[match[2]] : 1);
}
