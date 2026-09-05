/** One line per request: method, path, status, duration. */

import { CallHandler, ExecutionContext, HttpException, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Http');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      tap({
        next: () => this.write(request, response.statusCode, startedAt),
        error: (error: unknown) => this.write(request, statusOf(error), startedAt),
      }),
    );
  }

  private write(request: Request, status: number, startedAt: number): void {
    this.logger.log(`${request.method} ${request.originalUrl} ${status} ${Date.now() - startedAt}ms`);
  }
}

function statusOf(error: unknown): number {
  return error instanceof HttpException ? error.getStatus() : 500;
}
