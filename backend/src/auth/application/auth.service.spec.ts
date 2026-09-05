/** The single operator account. */

import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AppConfigService } from 'src/shared/config/app-config.service';
import { ADMIN_PASSWORD, ADMIN_USERNAME, testConfig } from 'src/test/http/auth';
import { AuthService, InvalidCredentialsError } from './auth.service';

// The real hashing, wrapped so a spec can see whether it ran at all.
jest.mock('bcryptjs', () => {
  const actual: typeof import('bcryptjs') = jest.requireActual('bcryptjs');
  return { ...actual, compare: jest.fn(actual.compare) };
});

interface Claims {
  readonly sub?: string;
  readonly iat: number;
  readonly exp: number;
}

function serviceFor(env: Readonly<Record<string, string>> = {}): {
  auth: AuthService;
  jwt: JwtService;
  config: AppConfigService;
} {
  const config = testConfig(env);
  const jwt = new JwtService({ secret: config.jwt.secret });
  return { auth: new AuthService(jwt, config), jwt, config };
}

describe('issuing a token', () => {
  it('reports the lifetime the configuration asked for, and signs it into the token', async () => {
    const { auth, jwt } = serviceFor({ JWT_EXPIRES_IN: '30m' });

    const token = await auth.login(ADMIN_USERNAME, ADMIN_PASSWORD);
    const claims = jwt.decode<Claims>(token.accessToken);

    expect(token.expiresIn).toBe(1800);
    expect(claims.exp - claims.iat).toBe(1800);
  });

  it.each([
    ['45', 45],
    ['30s', 30],
    ['15m', 900],
    ['12h', 43_200],
    ['7d', 604_800],
    ['  2h  ', 7200],
  ])('reads a lifetime written as "%s" as %i seconds', async (written, seconds) => {
    const { auth } = serviceFor({ JWT_EXPIRES_IN: written });

    await expect(auth.login(ADMIN_USERNAME, ADMIN_PASSWORD)).resolves.toMatchObject({
      expiresIn: seconds,
    });
  });

  it('names the operator as the subject, so a later request can be attributed', async () => {
    const { auth } = serviceFor();

    const token = await auth.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    await expect(auth.verify(token.accessToken)).resolves.toEqual({ username: ADMIN_USERNAME });
    expect(token.username).toBe(ADMIN_USERNAME);
  });
});

describe('refusing credentials', () => {
  it('tells a wrong password and an unknown username apart nowhere in the response', async () => {
    const { auth } = serviceFor();

    const wrongPassword = await refusalOf(auth.login(ADMIN_USERNAME, 'not-the-password'));
    const unknownUser = await refusalOf(auth.login('someone-else', ADMIN_PASSWORD));

    expect(wrongPassword).toBeInstanceOf(InvalidCredentialsError);
    expect(unknownUser).toBeInstanceOf(InvalidCredentialsError);
    expect(unknownUser.message).toBe(wrongPassword.message);
    expect(wrongPassword.message).toBe('Invalid username or password');
  });

  it('hashes the supplied password even when the username is unknown', async () => {
    const { auth, config } = serviceFor();
    const compare = jest.mocked(bcrypt.compare);
    compare.mockClear();

    await auth.login('someone-else', ADMIN_PASSWORD).catch(() => undefined);

    expect(compare).toHaveBeenCalledWith(ADMIN_PASSWORD, config.admin.passwordHash);
  });

  it('refuses an empty password rather than treating it as "no check needed"', async () => {
    const { auth } = serviceFor();

    await expect(auth.login(ADMIN_USERNAME, '')).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('is case sensitive about the username', async () => {
    const { auth } = serviceFor();

    await expect(auth.login('ADMIN', ADMIN_PASSWORD)).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });
});

describe('refusing to start on bad configuration', () => {
  it.each([
    ['a plaintext password', 'admin'],
    ['a truncated bcrypt hash', '$2a$10$AGcTPfSVwUrW07mgypq1Fu'],
    ['an unknown hash family', '$5$rounds=1000$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLM'],
    ['an empty-looking value', '-'],
  ])('refuses to construct with %s as ADMIN_PASSWORD_HASH', (_label, hash) => {
    expect(() => serviceFor({ ADMIN_PASSWORD_HASH: hash })).toThrow(
      'ADMIN_PASSWORD_HASH is not a bcrypt hash',
    );
  });

  it('accepts every bcrypt revision the library emits', () => {
    const hashes = ['2a', '2b', '2y'].map(
      (revision) => `$${revision}$10$AGcTPfSVwUrW07mgypq1Fu6CejEZPvl2Meg34WpkPw39iya5f7poS`,
    );

    for (const hash of hashes) {
      expect(() => serviceFor({ ADMIN_PASSWORD_HASH: hash })).not.toThrow();
    }
  });

  it.each(['soon', '12x', '1.5h', '-5m', '10 minutes', 'h', '3600s5'])(
    'refuses to construct with JWT_EXPIRES_IN="%s"',
    (written) => {
      expect(() => serviceFor({ JWT_EXPIRES_IN: written })).toThrow(/JWT_EXPIRES_IN/);
    },
  );
});

describe('verifying a token', () => {
  it('answers null rather than throwing, so the optional guard can carry on', async () => {
    const { auth } = serviceFor();

    await expect(auth.verify('not-a-token')).resolves.toBeNull();
    await expect(auth.verify('')).resolves.toBeNull();
    await expect(auth.verify('a.b.c')).resolves.toBeNull();
  });

  it('rejects a token signed with another secret', async () => {
    const { auth } = serviceFor();
    const forged = await new JwtService({ secret: 'a-different-secret' }).signAsync({
      sub: ADMIN_USERNAME,
    });

    await expect(auth.verify(forged)).resolves.toBeNull();
  });

  it('rejects a token whose lifetime has run out', async () => {
    const { auth, jwt } = serviceFor();
    const stale = await jwt.signAsync({ sub: ADMIN_USERNAME }, { expiresIn: -60 });

    await expect(auth.verify(stale)).resolves.toBeNull();
  });
});

/** The error a login rejected with, so two refusals can be compared against each other. */
async function refusalOf(attempt: Promise<unknown>): Promise<Error> {
  return attempt.then(
    () => {
      throw new Error('the login was accepted');
    },
    (thrown: unknown) => (thrown instanceof Error ? thrown : new Error(String(thrown))),
  );
}
