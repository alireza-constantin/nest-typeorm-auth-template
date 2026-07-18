import {
  BadRequestException,
  type ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProblemDetailsFilter } from './problem-details.filter';
import { RequestContextService } from './request-context.service';
import type { StructuredLoggerService } from './structured-logger.service';

function harness(requestId = 'request-123') {
  const headers = new Map<string, unknown>();
  const status = jest.fn();
  const type = jest.fn();
  const json = jest.fn();
  const response = {
    getHeader: jest.fn((name: string) => headers.get(name.toLowerCase())),
    setHeader: jest.fn((name: string, value: unknown) => {
      headers.set(name.toLowerCase(), value);
      return response;
    }),
    status: status.mockImplementation(() => response),
    type: type.mockImplementation(() => response),
    json: json.mockImplementation(() => response),
  } as unknown as Response;
  const request = { method: 'POST' } as Request;
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ArgumentsHost;
  const context = new RequestContextService();
  const event = jest.fn();
  const logger = { event } as unknown as StructuredLoggerService;
  const filter = new ProblemDetailsFilter(context, logger);

  return {
    filter,
    host,
    response,
    status,
    type,
    json,
    headers,
    context,
    event,
    requestId,
  };
}

describe('ProblemDetailsFilter', () => {
  it('normalizes validation errors into a stable problem contract', () => {
    const test = harness();

    test.context.run({ requestId: test.requestId }, () => {
      test.filter.catch(
        new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: ['email must be an email', 'password is too short'],
        }),
        test.host,
      );
    });

    expect(test.status).toHaveBeenCalledWith(400);
    expect(test.type).toHaveBeenCalledWith('application/problem+json');
    expect(test.json).toHaveBeenCalledWith({
      type: 'urn:better-commerce:problem:bad-request',
      title: 'Bad Request',
      status: 400,
      detail: 'Request validation failed',
      requestId: 'request-123',
      errors: [
        { detail: 'email must be an email' },
        { detail: 'password is too short' },
      ],
    });
  });

  it('preserves safe HttpException extensions and produces Retry-After', () => {
    const test = harness();

    test.context.run({ requestId: test.requestId }, () => {
      test.filter.catch(
        new HttpException(
          {
            statusCode: 429,
            message: 'Too many attempts',
            retryAfterSeconds: 17,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        ),
        test.host,
      );
    });

    expect(test.headers.get('retry-after')).toBe('17');
    expect(test.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 429,
        detail: 'Too many attempts',
        retryAfterSeconds: 17,
      }),
    );
  });

  it('returns a generic 500 and never exposes internal error details', () => {
    const test = harness();

    test.context.run({ requestId: test.requestId }, () => {
      test.filter.catch(
        new Error('postgres://admin:secret@db/internal stack material'),
        test.host,
      );
    });

    const body = (test.json.mock.calls as unknown[][]).at(0)?.at(0) as object;
    expect(body).toEqual({
      type: 'urn:better-commerce:problem:internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected server error occurred',
      requestId: 'request-123',
    });
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(test.event).toHaveBeenCalledWith('error', 'unhandled_exception', {
      method: 'POST',
      errorType: 'Error',
    });
  });
});
