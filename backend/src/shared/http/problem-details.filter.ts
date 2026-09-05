/** The single place an error becomes a response body, as RFC 7807 problem+json. */

import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly errors?: Record<string, string[]>;
}

const TITLES: Readonly<Record<number, string>> = {
  400: 'Bad request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  413: 'Payload too large',
  415: 'Unsupported media type',
  422: 'Unprocessable entity',
  429: 'Too many requests',
  500: 'Internal server error',
  503: 'Service unavailable',
};

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;

    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const problem = toProblem(exception, request.originalUrl);

    if (problem.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${request.method} ${request.originalUrl} failed`, stackOf(exception));
    }

    response.status(problem.status).type('application/problem+json').json(problem);
  }
}

function toProblem(exception: unknown, instance: string): ProblemDetails {
  if (exception instanceof HttpException) {
    return fromHttpException(exception, instance);
  }
  const upload = uploadLimit(exception);
  if (upload) return build(upload.status, upload.detail, instance);

  const body = bodyLimit(exception);
  if (body) return build(body.status, body.detail, instance);

  return build(HttpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred', instance);
}

function fromHttpException(exception: HttpException, instance: string): ProblemDetails {
  const status = exception.getStatus();
  const body = exception.getResponse();

  if (typeof body === 'string') return build(status, body, instance);

  const payload = body as { message?: string | string[]; errors?: unknown };
  const detail = Array.isArray(payload.message)
    ? payload.message.join('; ')
    : (payload.message ?? exception.message);

  return build(status, detail, instance, asErrorMap(payload.errors));
}

/** Multer rejects an oversized upload before any handler runs. Matched structurally to keep multer out of the shared layer. */
function uploadLimit(exception: unknown): { status: number; detail: string } | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const candidate = exception as { name?: unknown; code?: unknown; message?: unknown };
  if (candidate.name !== 'MulterError') return null;

  if (candidate.code === 'LIMIT_FILE_SIZE') {
    return { status: HttpStatus.PAYLOAD_TOO_LARGE, detail: 'The uploaded file exceeds the configured size limit' };
  }
  return {
    status: HttpStatus.BAD_REQUEST,
    detail: typeof candidate.message === 'string' ? candidate.message : 'The upload could not be read',
  };
}

/**
 * body-parser rejects an oversized JSON or form body with a plain Error carrying a status, which
 * would otherwise reach the client as a flat 500 saying nothing about the limit it broke.
 */
function bodyLimit(exception: unknown): { status: number; detail: string } | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const candidate = exception as { type?: unknown; limit?: unknown };
  if (candidate.type !== 'entity.too.large') return null;

  const limit = typeof candidate.limit === 'number' ? ` of ${String(candidate.limit)} bytes` : '';
  return {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    detail: `The request body exceeds the limit${limit}`,
  };
}

function asErrorMap(value: unknown): Record<string, string[]> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string[]] =>
      Array.isArray(entry[1]) && entry[1].every((message) => typeof message === 'string'),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function build(
  status: number,
  detail: string,
  instance: string,
  errors?: Record<string, string[]>,
): ProblemDetails {
  const title = TITLES[status] ?? 'Error';
  return {
    type: `urn:problem:${title.toLowerCase().replace(/\s+/g, '-')}`,
    title,
    status,
    detail,
    instance,
    ...(errors ? { errors } : {}),
  };
}

function stackOf(exception: unknown): string {
  if (exception instanceof Error) return exception.stack ?? exception.message;
  return String(exception);
}
