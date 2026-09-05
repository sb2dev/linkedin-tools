/** A guard sees only the request behind an ExecutionContext; this is the smallest one that works. */

import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedRequest } from 'src/auth/interface/jwt-auth.guard';

export interface StubRequest {
  headers: Record<string, string | undefined>;
  user?: { username: string };
}

export function requestWith(authorization?: string): StubRequest {
  return { headers: authorization === undefined ? {} : { authorization } };
}

export function httpContextOf(request: StubRequest): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request as unknown as AuthenticatedRequest }),
  } as unknown as ExecutionContext;
}

/** readBearerToken only ever reads `headers.authorization`. */
export function asExpressRequest(request: StubRequest): Request {
  return request as unknown as Request;
}
