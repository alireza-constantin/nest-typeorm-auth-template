import { ServiceUnavailableException } from '@nestjs/common';
import type { RedisClientType } from 'redis';
import {
  AbuseLimitExceededException,
  AbuseProtectionService,
} from './abuse-protection.service';
import type {
  DualIdentifierThrottleConfiguration,
  SecurityConfiguration,
} from './security.config';

const policy = (keyPrefix: string): DualIdentifierThrottleConfiguration => ({
  identifierLimit: 5,
  identifierWindowMs: 900_000,
  hmacSecret: '0123456789abcdef0123456789abcdef',
  ipLimit: 20,
  ipWindowMs: 60_000,
  keyPrefix,
});

const configuration: SecurityConfiguration = {
  trustedOrigins: new Set(['http://localhost:3000']),
  abuseProtection: {
    login: policy('test:{auth}:login:'),
    registration: policy('test:{auth}:registration:'),
    emailVerificationRequest: {
      ...policy('test:{auth}:verification-request:'),
      resendCooldownMs: 60_000,
    },
    emailVerificationConfirmation: policy(
      'test:{auth}:verification-confirmation:',
    ),
  },
};

describe('AbuseProtectionService', () => {
  const redis = {
    del: jest.fn(),
    eval: jest.fn(),
  };
  let service: AbuseProtectionService;

  const evalCallOptions = (index: number) =>
    (
      redis.eval.mock.calls as unknown as Array<
        [string, { keys: string[]; arguments: string[] }]
      >
    )[index][1];

  beforeEach(() => {
    jest.clearAllMocks();
    redis.eval.mockResolvedValue([1, 1, 60_000, 900_000]);
    service = new AbuseProtectionService(
      redis as unknown as RedisClientType,
      configuration,
    );
  });

  it('uses separate namespaces and never places raw identifiers in Redis keys', async () => {
    await service.consumeLogin('203.0.113.4', 'Customer@Example.com');
    await service.consumeRegistration('203.0.113.4', 'Customer@Example.com');

    const loginKeys = evalCallOptions(0).keys;
    const registrationKeys = evalCallOptions(1).keys;
    expect(loginKeys.every((key) => key.startsWith('test:{auth}:login:'))).toBe(
      true,
    );
    expect(
      registrationKeys.every((key) =>
        key.startsWith('test:{auth}:registration:'),
      ),
    ).toBe(true);
    expect([...loginKeys, ...registrationKeys].join(' ')).not.toContain(
      'customer@example.com',
    );
    expect([...loginKeys, ...registrationKeys].join(' ')).not.toContain(
      '203.0.113.4',
    );
  });

  it('atomically enforces verification resend cooldown with Retry-After metadata', async () => {
    redis.eval.mockResolvedValue([2, 2, 50_000, 800_000, 0, 45_100]);

    await expect(
      service.consumeEmailVerificationRequest(
        '203.0.113.4',
        'customer@example.com',
      ),
    ).rejects.toMatchObject<Partial<AbuseLimitExceededException>>({
      retryAfterSeconds: 46,
    });

    const options = evalCallOptions(0);
    expect(options.keys).toHaveLength(3);
    expect(options.arguments).toEqual(['60000', '900000', '60000']);
  });

  it('HMACs confirmation tokens and limits them independently from email requests', async () => {
    const rawToken = 'secret-verification-token';
    await service.consumeEmailVerificationConfirmation('203.0.113.4', rawToken);

    const keys = evalCallOptions(0).keys;
    expect(
      keys.every((key) =>
        key.startsWith('test:{auth}:verification-confirmation:'),
      ),
    ).toBe(true);
    expect(keys.join(' ')).not.toContain(rawToken);
  });

  it('fails closed when Redis cannot evaluate a policy', async () => {
    redis.eval.mockRejectedValue(new Error('redis unavailable'));

    await expect(
      service.consumeLogin('203.0.113.4', 'customer@example.com'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
