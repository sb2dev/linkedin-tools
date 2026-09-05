import { JwtService } from '@nestjs/jwt';
import { ADMIN_USERNAME, testConfig } from 'src/test/http/auth';
import { httpContextOf, requestWith } from 'src/test/http/execution-context';
import { AuthService } from '../application/auth.service';
import { OptionalJwtGuard } from './optional-jwt.guard';

const config = testConfig();
const jwt = new JwtService({ secret: config.jwt.secret });
const optional = new OptionalJwtGuard(new AuthService(jwt, config));

const validToken = (): Promise<string> => jwt.signAsync({ sub: ADMIN_USERNAME });

describe('the optional guard', () => {
  it('lets an anonymous request through with no caller attached', async () => {
    const request = requestWith();

    await expect(optional.canActivate(httpContextOf(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('identifies the caller when the token is good', async () => {
    const request = requestWith(`Bearer ${await validToken()}`);

    await expect(optional.canActivate(httpContextOf(request))).resolves.toBe(true);
    expect(request.user).toEqual({ username: ADMIN_USERNAME });
  });

  it.each([
    ['a malformed token', 'Bearer not-a-jwt'],
    ['a token signed elsewhere', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.wrong'],
  ])('lets %s through as anonymous rather than rejecting it', async (_label, header) => {
    const request = requestWith(header);

    await expect(optional.canActivate(httpContextOf(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('treats an expired token as anonymous, not as the caller it once named', async () => {
    const stale = await jwt.signAsync({ sub: ADMIN_USERNAME }, { expiresIn: -60 });
    const request = requestWith(`Bearer ${stale}`);

    await expect(optional.canActivate(httpContextOf(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });
});
