/** Identifies the caller when a token is present and never rejects, so one handler serves both. */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from '../application/auth.service';
import { AuthenticatedRequest, readBearerToken } from './jwt-auth.guard';

@Injectable()
export class OptionalJwtGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readBearerToken(request);
    if (token) {
      request.user = (await this.auth.verify(token)) ?? undefined;
    }
    return true;
  }
}
