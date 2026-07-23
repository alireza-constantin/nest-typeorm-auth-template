import { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';
import type {
  CookieOptions as SessionCookieOptions,
  SessionData,
} from 'express-session';

export const DEFAULT_SESSION_IDLE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const DEFAULT_SESSION_ABSOLUTE_TTL_SECONDS = 30 * 24 * 60 * 60;
const MINIMUM_SECRET_LENGTH = 32;

export interface SessionConfiguration {
  readonly absoluteTtlSeconds: number;
  readonly cookie: SessionCookieOptions;
  readonly cookieName: string;
  readonly idleTtlSeconds: number;
  readonly keyPrefix: string;
  readonly secrets: string[];
}

function positiveInteger(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const raw = config.get<string | number>(key);
  const value = raw === undefined ? fallback : Number(raw);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }

  return value;
}

function sessionSecrets(config: ConfigService): string[] {
  const secrets = (config.get<string>('SESSION_SECRETS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (secrets.length === 0) {
    throw new Error('SESSION_SECRETS must contain at least one secret');
  }

  if (secrets.some((secret) => secret.length < MINIMUM_SECRET_LENGTH)) {
    throw new Error(
      `Every SESSION_SECRETS value must be at least ${MINIMUM_SECRET_LENGTH} characters`,
    );
  }

  return secrets;
}

export function buildSessionConfiguration(
  config: ConfigService,
): SessionConfiguration {
  const production = config.get<string>('NODE_ENV') === 'production';
  const idleTtlSeconds = positiveInteger(
    config,
    'SESSION_IDLE_SECONDS',
    DEFAULT_SESSION_IDLE_TTL_SECONDS,
  );
  const absoluteTtlSeconds = positiveInteger(
    config,
    'SESSION_ABSOLUTE_SECONDS',
    DEFAULT_SESSION_ABSOLUTE_TTL_SECONDS,
  );

  if (absoluteTtlSeconds < idleTtlSeconds) {
    throw new Error(
      'SESSION_ABSOLUTE_SECONDS must be greater than or equal to SESSION_IDLE_SECONDS',
    );
  }

  const configuredPrefix = config.get<string>('SESSION_KEY_PREFIX')?.trim();

  return {
    absoluteTtlSeconds,
    cookie: {
      httpOnly: true,
      secure: production,
      sameSite: 'lax',
      path: '/',
      maxAge: idleTtlSeconds * 1_000,
    },
    cookieName: production
      ? '__Host-bc.sid'
      : (config.get<string>('SESSION_COOKIE_NAME')?.trim() ?? 'bc.sid'),
    idleTtlSeconds,
    keyPrefix: configuredPrefix || 'bc:sess:',
    secrets: sessionSecrets(config),
  };
}

export function remainingSessionTtlSeconds(
  session: SessionData,
  configuration: SessionConfiguration,
  now = Date.now(),
): number {
  const expiresAt = session.absoluteExpiresAt;

  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
    return configuration.idleTtlSeconds;
  }

  const remainingAbsoluteSeconds = Math.ceil((expiresAt - now) / 1_000);

  return Math.max(
    1,
    Math.min(configuration.idleTtlSeconds, remainingAbsoluteSeconds),
  );
}

export function clearCookieOptions(
  configuration: SessionConfiguration,
): CookieOptions {
  return {
    httpOnly: true,
    secure: configuration.cookie.secure === true,
    sameSite: configuration.cookie.sameSite,
    path: '/',
  };
}
