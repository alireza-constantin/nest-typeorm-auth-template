import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { Session } from 'express-session';
import { CSRF_HEADER_NAME } from './security.constants';

const TOKEN_BYTES = 32;
const TOKEN_LENGTH = 43;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function save(session: Session): Promise<void> {
  return new Promise((resolve, reject) => {
    session.save((error) =>
      error
        ? reject(
            error instanceof Error
              ? error
              : new Error('CSRF session persistence failed'),
          )
        : resolve(),
    );
  });
}

function isValidTokenShape(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === TOKEN_LENGTH &&
    TOKEN_PATTERN.test(value)
  );
}

@Injectable()
export class CsrfService {
  async issue(request: Request): Promise<string> {
    const existing = request.session.csrfSecret;

    if (isValidTokenShape(existing)) {
      return existing;
    }

    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    request.session.csrfSecret = token;

    try {
      await save(request.session);
    } catch {
      throw new ServiceUnavailableException(
        'Unable to persist CSRF protection state',
      );
    }

    return token;
  }

  assertValid(request: Request): void {
    const expected = request.session.csrfSecret;
    const supplied = request.get(CSRF_HEADER_NAME);

    if (!isValidTokenShape(expected) || !isValidTokenShape(supplied)) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    const expectedBuffer = Buffer.from(expected, 'ascii');
    const suppliedBuffer = Buffer.from(supplied, 'ascii');

    if (!timingSafeEqual(expectedBuffer, suppliedBuffer)) {
      throw new ForbiddenException('Invalid CSRF token');
    }
  }
}
