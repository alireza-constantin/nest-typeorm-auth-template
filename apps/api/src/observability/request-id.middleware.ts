import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { RequestContextService } from './request-context.service';

export const REQUEST_ID_HEADER = 'x-request-id';
const MAX_REQUEST_ID_LENGTH = 128;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function isValidRequestId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_REQUEST_ID_LENGTH &&
    REQUEST_ID_PATTERN.test(value)
  );
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContextService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const supplied = request.get(REQUEST_ID_HEADER);
    const requestId = isValidRequestId(supplied) ? supplied : randomUUID();

    response.setHeader(REQUEST_ID_HEADER, requestId);
    this.context.run({ requestId }, next);
  }
}
