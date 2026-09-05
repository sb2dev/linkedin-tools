import { CallHandler, ExecutionContext, Logger, NotFoundException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

function contextOf(type: 'http' | 'rpc', statusCode = 200): ExecutionContext {
  return {
    getType: () => type,
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', originalUrl: '/api/search?q=a' }),
      getResponse: () => ({ statusCode }),
    }),
  } as unknown as ExecutionContext;
}

function handlerOf(result: 'value' | 'error', error?: unknown): CallHandler {
  return { handle: () => (result === 'value' ? of('ok') : throwError(() => error)) };
}

describe('RequestLoggingInterceptor', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((message: unknown) => {
      logged.push(String(message));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs the method, path, status and duration of a request that succeeded', async () => {
    const interceptor = new RequestLoggingInterceptor();

    await new Promise((resolve) =>
      interceptor.intercept(contextOf('http', 201), handlerOf('value')).subscribe(resolve),
    );

    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/^GET \/api\/search\?q=a 201 \d+ms$/);
  });

  it('logs the status the failure carries rather than the one the response never got', async () => {
    const interceptor = new RequestLoggingInterceptor();

    await new Promise((resolve) =>
      interceptor
        .intercept(contextOf('http'), handlerOf('error', new NotFoundException()))
        .subscribe({ error: resolve }),
    );

    expect(logged[0]).toContain(' 404 ');
  });

  it('logs 500 for a failure that is not an HTTP exception, since that is what is sent', async () => {
    const interceptor = new RequestLoggingInterceptor();

    await new Promise((resolve) =>
      interceptor
        .intercept(contextOf('http'), handlerOf('error', new Error('boom')))
        .subscribe({ error: resolve }),
    );

    expect(logged[0]).toContain(' 500 ');
  });

  it('passes a non-HTTP context straight through: there is no request line to write', async () => {
    const interceptor = new RequestLoggingInterceptor();

    const value = await new Promise((resolve) =>
      interceptor.intercept(contextOf('rpc'), handlerOf('value')).subscribe(resolve),
    );

    expect(value).toBe('ok');
    expect(logged).toHaveLength(0);
  });
});
