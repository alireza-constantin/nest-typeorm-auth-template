import type { RequestHandler } from 'express';
import {
  clearCookieOptions,
  type SessionConfiguration,
} from './session.config';

export function createAbsoluteSessionExpiryMiddleware(
  configuration: SessionConfiguration,
): RequestHandler {
  return (request, response, next): void => {
    const session = request.session;

    if (!session?.userId) {
      next();
      return;
    }

    const expiresAt = session.absoluteExpiresAt;
    const invalidExpiry =
      typeof expiresAt !== 'number' ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now();

    if (!invalidExpiry) {
      next();
      return;
    }

    session.destroy((error) => {
      response.clearCookie(
        configuration.cookieName,
        clearCookieOptions(configuration),
      );
      next(error ?? undefined);
    });
  };
}
