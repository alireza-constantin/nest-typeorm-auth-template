import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import type { RedisClientType } from 'redis';
import { REDIS_CLIENT } from '../redis';
import { SECURITY_CONFIGURATION } from './security.constants';
import type {
  DualIdentifierThrottleConfiguration,
  SecurityConfiguration,
} from './security.config';

const CONSUME_DUAL_COUNTER_SCRIPT = `
local ipCount = redis.call('INCR', KEYS[1])
if ipCount == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end

local identifierCount = redis.call('INCR', KEYS[2])
if identifierCount == 1 then
  redis.call('PEXPIRE', KEYS[2], ARGV[2])
end

return {
  ipCount,
  identifierCount,
  redis.call('PTTL', KEYS[1]),
  redis.call('PTTL', KEYS[2])
}
`;

const CONSUME_VERIFICATION_REQUEST_SCRIPT = `
local ipCount = redis.call('INCR', KEYS[1])
if ipCount == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end

local identifierCount = redis.call('INCR', KEYS[2])
if identifierCount == 1 then
  redis.call('PEXPIRE', KEYS[2], ARGV[2])
end

local cooldownAcquired = redis.call('SET', KEYS[3], '1', 'PX', ARGV[3], 'NX')
local cooldownGranted = 0
if cooldownAcquired then
  cooldownGranted = 1
end

return {
  ipCount,
  identifierCount,
  redis.call('PTTL', KEYS[1]),
  redis.call('PTTL', KEYS[2]),
  cooldownGranted,
  redis.call('PTTL', KEYS[3])
}
`;

interface CounterResult {
  readonly identifierCount: number;
  readonly identifierTtlMs: number;
  readonly ipCount: number;
  readonly ipTtlMs: number;
}

interface VerificationRequestResult extends CounterResult {
  readonly cooldownGranted: boolean;
  readonly cooldownTtlMs: number;
}

type PolicyName =
  | 'login'
  | 'registration'
  | 'email verification request'
  | 'email verification confirmation';

export function normalizeAccountIdentifier(value: string): string {
  return value.trim().normalize('NFKC').toLowerCase();
}

export function requestIpAddress(request: Request): string {
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}

export class AbuseLimitExceededException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests. Try again later.',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

@Injectable()
export class AbuseProtectionService {
  private readonly configuration: SecurityConfiguration['abuseProtection'];

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
    @Inject(SECURITY_CONFIGURATION) configuration: SecurityConfiguration,
  ) {
    this.configuration = configuration.abuseProtection;
  }

  consumeLogin(ipAddress: string, email: string): Promise<void> {
    return this.consumeCounters(
      'login',
      this.configuration.login,
      ipAddress,
      normalizeAccountIdentifier(email),
      'account',
    );
  }

  consumeRegistration(ipAddress: string, email: string): Promise<void> {
    return this.consumeCounters(
      'registration',
      this.configuration.registration,
      ipAddress,
      normalizeAccountIdentifier(email),
      'account',
    );
  }

  async consumeEmailVerificationRequest(
    ipAddress: string,
    email: string,
  ): Promise<void> {
    const policy = this.configuration.emailVerificationRequest;
    const identifier = normalizeAccountIdentifier(email);
    const keys = [
      this.key(policy, 'ip', ipAddress || 'unknown'),
      this.key(policy, 'account', identifier),
      this.key(policy, 'cooldown', identifier),
    ];

    const raw = await this.evaluate(
      'email verification request',
      CONSUME_VERIFICATION_REQUEST_SCRIPT,
      keys,
      [
        String(policy.ipWindowMs),
        String(policy.identifierWindowMs),
        String(policy.resendCooldownMs),
      ],
    );
    const result = this.parseVerificationRequestResult(raw);
    const retryAfterMs = this.retryAfterMs(policy, result);
    const cooldownRetryMs = result.cooldownGranted
      ? 0
      : Math.max(1_000, result.cooldownTtlMs);

    if (retryAfterMs === 0 && cooldownRetryMs === 0) return;
    throw this.limitExceeded(Math.max(retryAfterMs, cooldownRetryMs));
  }

  consumeEmailVerificationConfirmation(
    ipAddress: string,
    rawToken: string,
  ): Promise<void> {
    return this.consumeCounters(
      'email verification confirmation',
      this.configuration.emailVerificationConfirmation,
      ipAddress,
      rawToken,
      'token',
    );
  }

  async resetLoginAfterSuccess(email: string): Promise<void> {
    const policy = this.configuration.login;
    const key = this.key(policy, 'account', normalizeAccountIdentifier(email));

    try {
      await this.redis.del(key);
    } catch {
      throw new ServiceUnavailableException(
        'Authentication protection is temporarily unavailable',
      );
    }
  }

  private async consumeCounters(
    policyName: PolicyName,
    policy: DualIdentifierThrottleConfiguration,
    ipAddress: string,
    identifier: string,
    identifierKind: 'account' | 'token',
  ): Promise<void> {
    const raw = await this.evaluate(
      policyName,
      CONSUME_DUAL_COUNTER_SCRIPT,
      [
        this.key(policy, 'ip', ipAddress || 'unknown'),
        this.key(policy, identifierKind, identifier),
      ],
      [String(policy.ipWindowMs), String(policy.identifierWindowMs)],
    );
    const result = this.parseCounterResult(raw);
    const retryAfterMs = this.retryAfterMs(policy, result);

    if (retryAfterMs === 0) return;
    throw this.limitExceeded(retryAfterMs);
  }

  private async evaluate(
    policyName: PolicyName,
    script: string,
    keys: string[],
    args: string[],
  ): Promise<unknown> {
    try {
      return await this.redis.eval(script, { keys, arguments: args });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(
        `${this.capitalize(policyName)} protection is temporarily unavailable`,
      );
    }
  }

  private retryAfterMs(
    policy: DualIdentifierThrottleConfiguration,
    result: CounterResult,
  ): number {
    const ipBlocked = result.ipCount > policy.ipLimit;
    const identifierBlocked = result.identifierCount > policy.identifierLimit;

    if (!ipBlocked && !identifierBlocked) return 0;
    return Math.max(
      ipBlocked ? result.ipTtlMs : 0,
      identifierBlocked ? result.identifierTtlMs : 0,
      1_000,
    );
  }

  private limitExceeded(retryAfterMs: number): AbuseLimitExceededException {
    return new AbuseLimitExceededException(
      Math.max(1, Math.ceil(retryAfterMs / 1_000)),
    );
  }

  private key(
    policy: DualIdentifierThrottleConfiguration,
    kind: 'account' | 'cooldown' | 'ip' | 'token',
    value: string,
  ): string {
    const digest = createHmac('sha256', policy.hmacSecret)
      .update(`${kind}\0${value}`)
      .digest('base64url');

    return `${policy.keyPrefix}${kind}:${digest}`;
  }

  private parseCounterResult(value: unknown): CounterResult {
    const numbers = this.parseNumbers(value, 4);
    return {
      ipCount: numbers[0],
      identifierCount: numbers[1],
      ipTtlMs: numbers[2],
      identifierTtlMs: numbers[3],
    };
  }

  private parseVerificationRequestResult(
    value: unknown,
  ): VerificationRequestResult {
    const numbers = this.parseNumbers(value, 6);
    return {
      ipCount: numbers[0],
      identifierCount: numbers[1],
      ipTtlMs: numbers[2],
      identifierTtlMs: numbers[3],
      cooldownGranted: numbers[4] === 1,
      cooldownTtlMs: numbers[5],
    };
  }

  private parseNumbers(value: unknown, length: number): number[] {
    if (
      !Array.isArray(value) ||
      value.length !== length ||
      value.some((item) => typeof item !== 'number')
    ) {
      throw new ServiceUnavailableException(
        'Abuse protection returned an invalid response',
      );
    }

    return value as number[];
  }

  private capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
