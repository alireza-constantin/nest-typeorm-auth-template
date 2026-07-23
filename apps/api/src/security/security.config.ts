import { ConfigService } from '@nestjs/config';

const MINIMUM_HMAC_SECRET_LENGTH = 32;

export interface DualIdentifierThrottleConfiguration {
  readonly identifierLimit: number;
  readonly identifierWindowMs: number;
  readonly hmacSecret: string;
  readonly ipLimit: number;
  readonly ipWindowMs: number;
  readonly keyPrefix: string;
}

export interface VerificationRequestThrottleConfiguration extends DualIdentifierThrottleConfiguration {
  readonly resendCooldownMs: number;
}

export interface AbuseProtectionConfiguration {
  readonly emailVerificationConfirmation: DualIdentifierThrottleConfiguration;
  readonly emailVerificationRequest: VerificationRequestThrottleConfiguration;
  readonly login: DualIdentifierThrottleConfiguration;
  readonly registration: DualIdentifierThrottleConfiguration;
}

export interface SecurityConfiguration {
  readonly abuseProtection: AbuseProtectionConfiguration;
  readonly trustedOrigins: ReadonlySet<string>;
}

function required(config: ConfigService, key: string): string {
  const value = config.get<string>(key)?.trim();

  if (!value) {
    throw new Error(`${key} must be configured`);
  }

  return value;
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

function redisAtomicKeyPrefix(value: string, key: string): string {
  if (!/\{[^{}]+\}/.test(value)) {
    throw new Error(
      `${key} must contain a non-empty Redis Cluster hash tag such as {auth}`,
    );
  }

  return value;
}

export function normalizeTrustedOrigin(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid trusted origin: ${value}`);
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(
      `Trusted origin must contain only an http(s) scheme, host, and optional port: ${value}`,
    );
  }

  return url.origin;
}

function trustedOrigins(config: ConfigService): ReadonlySet<string> {
  const values = required(config, 'TRUSTED_ORIGINS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeTrustedOrigin);

  if (values.length === 0) {
    throw new Error('TRUSTED_ORIGINS must contain at least one origin');
  }

  if (
    config.get<string>('NODE_ENV') === 'production' &&
    values.some((origin) => !origin.startsWith('https://'))
  ) {
    throw new Error('Every production TRUSTED_ORIGINS value must use https');
  }

  return new Set(values);
}

export function buildSecurityConfiguration(
  config: ConfigService,
): SecurityConfiguration {
  const hmacSecret =
    config.get<string>('ABUSE_PROTECTION_HMAC_SECRET')?.trim() ||
    required(config, 'LOGIN_THROTTLE_HMAC_SECRET');

  if (hmacSecret.length < MINIMUM_HMAC_SECRET_LENGTH) {
    throw new Error(
      `The abuse-protection HMAC secret must be at least ${MINIMUM_HMAC_SECRET_LENGTH} characters`,
    );
  }

  // The shared hash tag keeps the keys used by each Lua script in one Redis
  // Cluster slot. The route segment prevents one public flow from consuming
  // another flow's budget.
  const rootPrefix = redisAtomicKeyPrefix(
    config.get<string>('ABUSE_PROTECTION_KEY_PREFIX')?.trim() ||
      'bc:abuse:{auth}:',
    'ABUSE_PROTECTION_KEY_PREFIX',
  );

  const policy = (
    name: string,
    environmentPrefix: string,
    defaults: {
      identifierLimit: number;
      identifierWindowSeconds: number;
      ipLimit: number;
      ipWindowSeconds: number;
    },
  ): DualIdentifierThrottleConfiguration => ({
    identifierLimit: positiveInteger(
      config,
      `${environmentPrefix}_IDENTIFIER_LIMIT`,
      defaults.identifierLimit,
    ),
    identifierWindowMs:
      positiveInteger(
        config,
        `${environmentPrefix}_IDENTIFIER_WINDOW_SECONDS`,
        defaults.identifierWindowSeconds,
      ) * 1_000,
    hmacSecret,
    ipLimit: positiveInteger(
      config,
      `${environmentPrefix}_IP_LIMIT`,
      defaults.ipLimit,
    ),
    ipWindowMs:
      positiveInteger(
        config,
        `${environmentPrefix}_IP_WINDOW_SECONDS`,
        defaults.ipWindowSeconds,
      ) * 1_000,
    keyPrefix: redisAtomicKeyPrefix(
      config.get<string>(`${environmentPrefix}_KEY_PREFIX`)?.trim() ||
        `${rootPrefix}${name}:`,
      `${environmentPrefix}_KEY_PREFIX`,
    ),
  });

  const login = policy('login', 'LOGIN_THROTTLE', {
    identifierLimit: positiveInteger(config, 'LOGIN_THROTTLE_ACCOUNT_LIMIT', 5),
    identifierWindowSeconds: positiveInteger(
      config,
      'LOGIN_THROTTLE_ACCOUNT_WINDOW_SECONDS',
      15 * 60,
    ),
    ipLimit: 20,
    ipWindowSeconds: 60,
  });
  const emailVerificationRequest = policy(
    'email-verification-request',
    'EMAIL_VERIFICATION_REQUEST_THROTTLE',
    {
      identifierLimit: 3,
      identifierWindowSeconds: 60 * 60,
      ipLimit: 20,
      ipWindowSeconds: 15 * 60,
    },
  );

  return {
    trustedOrigins: trustedOrigins(config),
    abuseProtection: {
      login,
      registration: policy('registration', 'REGISTRATION_THROTTLE', {
        identifierLimit: 5,
        identifierWindowSeconds: 60 * 60,
        ipLimit: 10,
        ipWindowSeconds: 15 * 60,
      }),
      emailVerificationRequest: {
        ...emailVerificationRequest,
        resendCooldownMs:
          positiveInteger(
            config,
            'EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS',
            60,
          ) * 1_000,
      },
      emailVerificationConfirmation: policy(
        'email-verification-confirmation',
        'EMAIL_VERIFICATION_CONFIRM_THROTTLE',
        {
          identifierLimit: 5,
          identifierWindowSeconds: 15 * 60,
          ipLimit: 30,
          ipWindowSeconds: 15 * 60,
        },
      ),
    },
  };
}
