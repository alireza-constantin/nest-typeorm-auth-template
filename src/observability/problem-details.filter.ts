import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { RequestContextService } from './request-context.service';
import { REQUEST_ID_HEADER } from './request-id.middleware';
import { StructuredLoggerService } from './structured-logger.service';

interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly requestId: string;
  readonly errors?: ReadonlyArray<{ detail: string }>;
  readonly [extension: string]: unknown;
}

const TITLES: Partial<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

const RESERVED_KEYS = new Set([
  'statusCode',
  'error',
  'message',
  'type',
  'title',
  'status',
  'detail',
  'requestId',
  'errors',
]);
const SAFE_HEADER_NAMES = new Set(['allow', 'retry-after', 'www-authenticate']);

function titleFor(status: number): string {
  return TITLES[status] ?? 'HTTP Error';
}

function problemType(status: number): string {
  if (status === 400) {
    return 'urn:better-commerce:problem:bad-request';
  }
  return `urn:better-commerce:problem:http-${status}`;
}

function safeExtensions(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const extensions: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (RESERVED_KEYS.has(key)) continue;
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      extensions[key] = value;
    }
  }
  return extensions;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(
    private readonly context: RequestContextService,
    private readonly logger: StructuredLoggerService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId =
      this.context.getRequestId() ??
      (response.getHeader(REQUEST_ID_HEADER) as string | undefined) ??
      randomUUID();

    response.setHeader(REQUEST_ID_HEADER, requestId);

    if (!(exception instanceof HttpException)) {
      this.logger.event('error', 'unhandled_exception', {
        method: request.method,
        errorType:
          exception instanceof Error ? exception.constructor.name : 'Unknown',
      });
      response
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .type('application/problem+json')
        .json({
          type: 'urn:better-commerce:problem:internal-server-error',
          title: 'Internal Server Error',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          detail: 'An unexpected server error occurred',
          requestId,
        } satisfies ProblemDetails);
      return;
    }

    const status = exception.getStatus();
    const body = exception.getResponse();
    const objectBody =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>)
        : undefined;
    const rawMessage = objectBody?.message;
    const validationMessages = Array.isArray(rawMessage)
      ? rawMessage.filter((value): value is string => typeof value === 'string')
      : undefined;
    const detail =
      validationMessages && validationMessages.length > 0
        ? 'Request validation failed'
        : typeof rawMessage === 'string'
          ? rawMessage
          : typeof body === 'string'
            ? body
            : titleFor(status);
    const title =
      typeof objectBody?.error === 'string'
        ? objectBody.error
        : titleFor(status);

    this.copyExceptionHeaders(exception, response);
    const retryAfterSeconds = objectBody?.retryAfterSeconds;
    if (
      response.getHeader('retry-after') === undefined &&
      typeof retryAfterSeconds === 'number' &&
      Number.isSafeInteger(retryAfterSeconds) &&
      retryAfterSeconds > 0
    ) {
      response.setHeader('retry-after', String(retryAfterSeconds));
    }

    response
      .status(status)
      .type('application/problem+json')
      .json({
        type: problemType(status),
        title,
        status,
        detail,
        requestId,
        ...(validationMessages
          ? {
              errors: validationMessages.map((message) => ({
                detail: message,
              })),
            }
          : {}),
        ...(objectBody ? safeExtensions(objectBody) : {}),
      } satisfies ProblemDetails);
  }

  private copyExceptionHeaders(exception: HttpException, response: Response) {
    const candidate = exception as HttpException & {
      getHeaders?: () => Record<string, string | string[]>;
    };
    if (typeof candidate.getHeaders !== 'function') return;

    for (const [name, value] of Object.entries(candidate.getHeaders())) {
      if (SAFE_HEADER_NAMES.has(name.toLowerCase())) {
        response.setHeader(name, value);
      }
    }
  }
}
