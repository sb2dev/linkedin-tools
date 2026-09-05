/**
 * Boots a Nest application over the controllers a spec names, with the same global prefix, pipe,
 * filter and interceptor main.ts installs. A route is only worth testing through the pipeline that
 * will actually serve it: the validation pipe and the problem-details filter decide most of the
 * contract.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { ModuleMetadata } from '@nestjs/common/interfaces';
import { Test } from '@nestjs/testing';
import { ProblemDetailsFilter } from 'src/shared/http/problem-details.filter';
import { RequestLoggingInterceptor } from 'src/shared/http/request-logging.interceptor';
import { validationExceptionFactory } from 'src/shared/http/validation-exception.factory';

export async function createHttpApp(metadata: ModuleMetadata): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule(metadata).compile();
  const app = moduleRef.createNestApplication({ logger: false });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());

  await app.init();
  return app;
}

/** The RFC 7807 document, as a spec reads it back off the wire. */
export interface ProblemBody {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly errors?: Record<string, string[]>;
}

export function asProblem(body: unknown): ProblemBody {
  return body as ProblemBody;
}
