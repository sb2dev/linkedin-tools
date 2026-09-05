/** The required guard, and the header reading both guards share. */

import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ADMIN_USERNAME, testConfig } from 'src/test/http/auth';
import { asExpressRequest, httpContextOf, requestWith } from 'src/test/http/execution-context';
import { AuthService } from '../application/auth.service';
import { JwtAuthGuard, readBearerToken } from './jwt-auth.guard';

const config = testConfig();
const jwt = new JwtService({ secret: config.jwt.secret });
const auth = new AuthService(jwt, config);
const required = new JwtAuthGuard(auth);

const validToken = (): Promise<string> => jwt.signAsync({ sub: ADMIN_USERNAME });

describe('reading the Authorization header', () => {
  it.each([
    ['no header at all', undefined],
    ['an empty header', ''],
    ['another scheme', 'Basic YWRtaW46YWRtaW4='],
    ['a bearer scheme with no token', 'Bearer'],
    ['a bearer scheme with an empty token', 'Bearer '],
    ['a bare token', 'some-token-without-a-scheme'],
  ])('finds no token in %s', (_label, header) => {
    expect(readBearerToken(asExpressRequest(requestWith(header)))).toBeNull();
  });

  it.each(['Bearer', 'bearer', 'BEARER'])('accepts "%s" as the scheme', (scheme) => {
    expect(readBearerToken(asExpressRequest(requestWith(`${scheme} abc.def.ghi`)))).toBe(
      'abc.def.ghi',
    );
  });
});

describe('the required guard', () => {
  it('puts the caller the token names on the request', async () => {
    const request = requestWith(`Bearer ${await validToken()}`);

    await expect(required.canActivate(httpContextOf(request))).resolves.toBe(true);
    expect(request.user).toEqual({ username: ADMIN_USERNAME });
  });

  it('refuses a request with no token, saying one is required', async () => {
    const request = requestWith();

    await expect(required.canActivate(httpContextOf(request))).rejects.toThrow(
      new UnauthorizedException('A bearer token is required'),
    );
    expect(request.user).toBeUndefined();
  });

  it.each([
    ['a malformed token', 'Bearer not-a-jwt'],
    ['three segments of nonsense', 'Bearer a.b.c'],
  ])('refuses %s and leaves no caller behind', async (_label, header) => {
    const request = requestWith(header);

    await expect(required.canActivate(httpContextOf(request))).rejects.toThrow(
      'The bearer token is invalid or has expired',
    );
    expect(request.user).toBeUndefined();
  });

  it('refuses a token that has expired', async () => {
    const request = requestWith(
      `Bearer ${await jwt.signAsync({ sub: ADMIN_USERNAME }, { expiresIn: -60 })}`,
    );

    await expect(required.canActivate(httpContextOf(request))).rejects.toThrow(UnauthorizedException);
    expect(request.user).toBeUndefined();
  });

  it('refuses a token signed with another secret', async () => {
    const forged = await new JwtService({ secret: 'another-secret' }).signAsync({
      sub: ADMIN_USERNAME,
    });

    await expect(required.canActivate(httpContextOf(requestWith(`Bearer ${forged}`)))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
