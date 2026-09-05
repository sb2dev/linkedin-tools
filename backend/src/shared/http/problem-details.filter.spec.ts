import { Controller, ForbiddenException, Get, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { asProblem, createHttpApp } from 'src/test/http/app';
import { ProblemDetailsFilter } from './problem-details.filter';

/** The shape multer raises before any handler runs; matched structurally by the filter. */
class FakeMulterError extends Error {
  readonly name = 'MulterError';

  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const LEAKY_MESSAGE = 'column "twitter_username" does not exist in relation "profiles"';

@Controller('boom')
class BoomController {
  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenException('this account may not do that');
  }

  @Get('field-errors')
  fieldErrors(): never {
    throw new HttpException(
      { message: 'One or more fields are invalid', errors: { size: ['size must not exceed 100'] } },
      HttpStatus.BAD_REQUEST,
    );
  }

  @Get('many-messages')
  manyMessages(): never {
    throw new HttpException({ message: ['q is too long', 'page must be an integer'] }, 400);
  }

  @Get('unexpected')
  unexpected(): never {
    throw new Error(LEAKY_MESSAGE);
  }

  @Get('thrown-string')
  thrownString(): never {
    throw LEAKY_MESSAGE;
  }

  @Get('teapot')
  teapot(): never {
    throw new HttpException('short and stout', 418);
  }

  @Get('upload-too-large')
  uploadTooLarge(): never {
    throw new FakeMulterError('LIMIT_FILE_SIZE', 'File too large');
  }

  @Get('upload-unreadable')
  uploadUnreadable(): never {
    throw new FakeMulterError('LIMIT_UNEXPECTED_FILE', 'Unexpected field');
  }

  @Get('no-message')
  noMessage(): never {
    // A body carrying field errors and no message of its own.
    throw new HttpException({ errors: { q: ['q is too long'] } }, HttpStatus.BAD_REQUEST);
  }

  @Get('upload-without-message')
  uploadWithoutMessage(): never {
    // The filter matches multer structurally, so it also sees shapes multer would never raise.
    throw { name: 'MulterError', code: 'LIMIT_PART_COUNT' };
  }

  @Get('bad-error-map')
  badErrorMap(): never {
    throw new HttpException({ message: 'nope', errors: { size: [1, 2], q: 'not an array' } }, 400);
  }
}

describe('the problem document', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createHttpApp({ controllers: [BoomController] });
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(path);

  it('answers as application/problem+json with every member RFC 7807 requires', async () => {
    const response = await get('/api/boom/forbidden');

    expect(response.status).toBe(403);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(asProblem(response.body)).toEqual({
      type: 'urn:problem:forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'this account may not do that',
      instance: '/api/boom/forbidden',
    });
  });

  it('points `instance` at the request that failed, query string included', async () => {
    const response = await get('/api/boom/forbidden?q=growth&page=2');

    expect(asProblem(response.body).instance).toBe('/api/boom/forbidden?q=growth&page=2');
  });

  it('carries the per-field map through untouched, so a form can place each message', async () => {
    const response = await get('/api/boom/field-errors');

    expect(asProblem(response.body).errors).toEqual({ size: ['size must not exceed 100'] });
    expect(asProblem(response.body).detail).toBe('One or more fields are invalid');
  });

  it('joins several messages into one readable detail', async () => {
    const response = await get('/api/boom/many-messages');

    expect(asProblem(response.body).detail).toBe('q is too long; page must be an integer');
  });

  it('drops an errors member that is not a map of message lists', async () => {
    const response = await get('/api/boom/bad-error-map');

    expect(asProblem(response.body).errors).toBeUndefined();
    expect(response.status).toBe(400);
  });

  it.each([
    ['an error object', '/api/boom/unexpected'],
    ['a thrown string', '/api/boom/thrown-string'],
  ])('answers %s with a flat 500 that leaks nothing about the internals', async (_label, path) => {
    const response = await get(path);
    const body = asProblem(response.body);

    expect(response.status).toBe(500);
    expect(body.detail).toBe('An unexpected error occurred');
    expect(body.title).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('twitter_username');
    expect(JSON.stringify(body)).not.toContain('stack');
    expect(JSON.stringify(body)).not.toContain('.spec.ts');
  });

  it('still produces a document for a status it has no title for', async () => {
    const response = await get('/api/boom/teapot');

    expect(response.status).toBe(418);
    expect(asProblem(response.body)).toMatchObject({
      type: 'urn:problem:error',
      title: 'Error',
      detail: 'short and stout',
    });
  });

  it('turns an oversized upload into a 413 that says what went wrong', async () => {
    const response = await get('/api/boom/upload-too-large');

    expect(response.status).toBe(413);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(asProblem(response.body)).toMatchObject({
      title: 'Payload too large',
      detail: 'The uploaded file exceeds the configured size limit',
    });
  });

  it('turns any other upload failure into a 400, not a 500', async () => {
    const response = await get('/api/boom/upload-unreadable');

    expect(response.status).toBe(400);
    expect(asProblem(response.body).detail).toBe('Unexpected field');
  });

  it('falls back to the exception message when the body carries none', async () => {
    const response = await get('/api/boom/no-message');

    expect(response.status).toBe(400);
    expect(asProblem(response.body).errors).toEqual({ q: ['q is too long'] });
    expect(asProblem(response.body).detail).toBe('Http Exception');
  });

  it('names an upload failure that carries no message of its own', async () => {
    const response = await get('/api/boom/upload-without-message');

    expect(response.status).toBe(400);
    expect(asProblem(response.body).detail).toBe('The upload could not be read');
  });

  it('answers an unknown route with a problem document rather than a page of HTML', async () => {
    const response = await get('/api/no-such-endpoint');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(asProblem(response.body).title).toBe('Not found');
  });
});

describe('the failures that never reach a response', () => {
  const filter = new ProblemDetailsFilter();

  it('rethrows on a transport that has no HTTP response to write to', () => {
    const rpcHost = { getType: () => 'rpc' } as unknown as ArgumentsHost;
    const failure = new Error('the queue rejected the message');

    expect(() => filter.catch(failure, rpcHost)).toThrow(failure);
  });

  it('logs the message when the error it caught carries no stack', () => {
    // An Error rebuilt from a serialised one, across a worker or an IPC boundary, has no stack.
    const stackless = new Error('the corpus is unreachable');
    stackless.stack = undefined;

    const logged: unknown[] = [];
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((...args: unknown[]) => void logged.push(args[1]));
    const response = { status: () => response, type: () => response, json: () => response };
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', originalUrl: '/api/search' }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    try {
      filter.catch(stackless, host);
    } finally {
      error.mockRestore();
    }

    expect(logged).toEqual(['the corpus is unreachable']);
  });
});

describe('an oversized request body', () => {
  const filter = new ProblemDetailsFilter();

  /** Drives the filter directly and returns the document it wrote. */
  function problemFor(exception: unknown): { status: number; detail: string } {
    let written: { status: number; detail: string } | undefined;
    const response = {
      status: () => response,
      type: () => response,
      json: (body: { status: number; detail: string }) => {
        written = body;
        return response;
      },
    };
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', originalUrl: '/api/imports' }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    filter.catch(exception, host);
    if (!written) throw new Error('the filter wrote no document');
    return written;
  }

  it('becomes a 413 naming the limit, not a flat 500', () => {
    const problem = problemFor(
      Object.assign(new Error('request entity too large'), { type: 'entity.too.large', limit: 262144 }),
    );

    expect(problem.status).toBe(413);
    expect(problem.detail).toBe('The request body exceeds the limit of 262144 bytes');
  });

  it('still answers 413 when the parser reported no limit', () => {
    const problem = problemFor(Object.assign(new Error('too large'), { type: 'entity.too.large' }));

    expect(problem.detail).toBe('The request body exceeds the limit');
  });

  it('leaves an unrelated parser failure as a 500', () => {
    const problem = problemFor(Object.assign(new Error('bad json'), { type: 'entity.parse.failed' }));

    expect(problem.status).toBe(500);
  });
});
