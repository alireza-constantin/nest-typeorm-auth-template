import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { Session } from 'express-session';
import { SESSION_CONFIGURATION } from './session.constants';
import type { SessionConfiguration } from './session.config';
import type { AuthenticatedSessionInput } from './session.types';

function sessionError(error: unknown, operation: string): Error {
  return error instanceof Error
    ? error
    : new Error(`Session ${operation} failed`);
}

function regenerate(session: Session): Promise<void> {
  return new Promise((resolve, reject) => {
    session.regenerate((error) =>
      error ? reject(sessionError(error, 'regeneration')) : resolve(),
    );
  });
}

function save(session: Session): Promise<void> {
  return new Promise((resolve, reject) => {
    session.save((error) =>
      error ? reject(sessionError(error, 'save')) : resolve(),
    );
  });
}

function destroy(session: Session): Promise<void> {
  return new Promise((resolve, reject) => {
    session.destroy((error) =>
      error ? reject(sessionError(error, 'destruction')) : resolve(),
    );
  });
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(SESSION_CONFIGURATION)
    private readonly configuration: SessionConfiguration,
  ) {}

  /**
   * Regenerates before authenticating to prevent session fixation, then waits for
   * Redis persistence so a successful login is never returned for an unsaved session.
   */
  async establishAuthenticatedSession(
    request: Request,
    input: AuthenticatedSessionInput,
  ): Promise<void> {
    await regenerate(request.session);

    const now = Date.now();
    const session = request.session;
    session.userId = input.userId;
    session.authVersion = input.authVersion;
    session.createdAt = now;
    session.authenticatedAt = now;
    session.authenticationMethod = input.authenticationMethod;
    session.absoluteExpiresAt =
      now + this.configuration.absoluteTtlSeconds * 1_000;

    await save(session);
  }

  async destroy(session: Session): Promise<void> {
    await destroy(session);
  }
}
