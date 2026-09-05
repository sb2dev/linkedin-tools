/** Requires a valid bearer token and puts the caller on the request. */

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../application/auth.service';
import { AuthenticatedUser } from '../domain/authenticated-user';

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export function readBearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readBearerToken(request);
    if (!token) throw new UnauthorizedException('A bearer token is required');

    const user = await this.auth.verify(token);
    if (!user) throw new UnauthorizedException('The bearer token is invalid or has expired');

    request.user = user;
    return true;
  }
}
