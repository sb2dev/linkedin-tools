/** The caller a guard put on the request, or undefined behind the optional guard. */

import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { AuthenticatedRequest } from './jwt-auth.guard';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
