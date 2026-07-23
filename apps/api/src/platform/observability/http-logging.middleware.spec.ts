import type { NextFunction, Request, Response } from 'express';
import { EventEmitter } from 'node:events';
import { HttpLoggingMiddleware } from './http-logging.middleware';
import type { StructuredLoggerService } from './structured-logger.service';

function response(statusCode = 200): Response {
  const emitter = new EventEmitter() as EventEmitter & {
    statusCode: number;
  };
  emitter.statusCode = statusCode;
  return emitter as unknown as Response;
}

describe('HttpLoggingMiddleware', () => {
  it('logs exactly once after a routed response finishes', () => {
    const event = jest.fn();
    const middleware = new HttpLoggingMiddleware({
      event,
    } as unknown as StructuredLoggerService);
    const request = {
      method: 'GET',
      baseUrl: '/users',
      route: { path: '/:id' },
      originalUrl: '/users/customer@example.com?token=secret',
      headers: { authorization: 'Bearer secret' },
      body: { password: 'secret' },
      authUser: { id: 'user-123' },
    } as unknown as Request;
    const res = response();
    const next = jest.fn() as NextFunction;

    middleware.use(request, res, next);
    res.emit('finish');
    res.emit('close');

    expect(next).toHaveBeenCalledTimes(1);
    expect(event).toHaveBeenCalledTimes(1);
    expect(event).toHaveBeenCalledWith(
      'info',
      'http_request_completed',
      expect.objectContaining({
        method: 'GET',
        route: '/users/:id',
        statusCode: 200,
        outcome: 'completed',
        userId: 'user-123',
      }),
    );
    expect(JSON.stringify(event.mock.calls)).not.toContain(
      'customer@example.com',
    );
    expect(JSON.stringify(event.mock.calls)).not.toContain('Bearer secret');
  });

  it('logs middleware failures and aborted connections without a raw URL', () => {
    const event = jest.fn();
    const middleware = new HttpLoggingMiddleware({
      event,
    } as unknown as StructuredLoggerService);
    const request = {
      method: 'POST',
      baseUrl: '',
      originalUrl: '/auth/login?password=secret',
    } as Request;
    const res = response(403);

    middleware.use(request, res, (() => undefined) as NextFunction);
    res.emit('close');

    expect(event).toHaveBeenCalledWith(
      'info',
      'http_request_completed',
      expect.objectContaining({
        method: 'POST',
        route: 'unmatched',
        statusCode: 403,
        outcome: 'aborted',
      }),
    );
    expect(JSON.stringify(event.mock.calls)).not.toContain('password=secret');
  });
});
