import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { buildConfiguration } from '../src/platform/config/configuration';
import { normalizeEmail } from '../src/modules/identity/auth/auth.service';
import {
  buildSessionConfiguration,
  DEFAULT_SESSION_ABSOLUTE_TTL_SECONDS,
  DEFAULT_SESSION_IDLE_TTL_SECONDS,
  remainingSessionTtlSeconds,
} from '../src/modules/identity/session/session.config';

const validEnvironment = () => ({
  NODE_ENV: 'test',
  DB_HOST: 'localhost',
  DB_USER: 'test_user',
  DB_PASSWORD: 'test_password',
  DB_NAME: 'better_commerce_test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRETS: '0123456789abcdef0123456789abcdef',
});

describe('Security configuration contracts', () => {
  it('normalizes email consistently for unique lookup', () => {
    expect(normalizeEmail('  USER@Example.COM  ')).toBe('user@example.com');
    expect(normalizeEmail('ｕｓｅｒ@example.com')).toBe('user@example.com');
  });

  it('refuses the temporary unverified-registration policy in production', () => {
    expect(() =>
      buildConfiguration({
        ...validEnvironment(),
        NODE_ENV: 'production',
        PUBLIC_REGISTRATION: 'true',
        REQUIRE_EMAIL_VERIFICATION: 'false',
      }),
    ).toThrow(
      'Production public registration requires email verification to be enabled',
    );
  });

  it('refuses weak session secrets', () => {
    expect(() =>
      buildConfiguration({
        ...validEnvironment(),
        SESSION_SECRETS: 'too-short',
      }),
    ).toThrow('Every SESSION_SECRETS entry must be at least 32 characters');
  });

  it('builds validated Redis configuration', () => {
    expect(
      buildConfiguration({
        ...validEnvironment(),
        REDIS_CONNECT_TIMEOUT_MS: '7500',
      }).redis,
    ).toEqual({
      url: 'redis://localhost:6379',
      connectTimeoutMs: 7_500,
    });
  });

  it('refuses an invalid Redis connection timeout', () => {
    expect(() =>
      buildConfiguration({
        ...validEnvironment(),
        REDIS_CONNECT_TIMEOUT_MS: '0',
      }),
    ).toThrow('REDIS_CONNECT_TIMEOUT_MS must be an integer');
  });

  it('uses an HTTPS-only host cookie and the agreed TTLs in production', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: new ConfigService({
            NODE_ENV: 'production',
            SESSION_SECRETS: '0123456789abcdef0123456789abcdef',
          }),
        },
      ],
    }).compile();

    const configuration = buildSessionConfiguration(
      moduleRef.get(ConfigService),
    );

    expect(configuration.cookieName).toBe('__Host-bc.sid');
    expect(configuration.cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: DEFAULT_SESSION_IDLE_TTL_SECONDS * 1_000,
    });
    expect(configuration.idleTtlSeconds).toBe(DEFAULT_SESSION_IDLE_TTL_SECONDS);
    expect(configuration.absoluteTtlSeconds).toBe(
      DEFAULT_SESSION_ABSOLUTE_TTL_SECONDS,
    );
  });

  it('caps Redis session TTL at absolute expiry', () => {
    const configuration = buildSessionConfiguration(
      new ConfigService({
        SESSION_SECRETS: '0123456789abcdef0123456789abcdef',
      }),
    );
    const now = Date.now();

    expect(
      remainingSessionTtlSeconds(
        { absoluteExpiresAt: now + 60_000 } as never,
        configuration,
        now,
      ),
    ).toBe(60);
  });
});
