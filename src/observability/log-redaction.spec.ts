import { redactForLogging } from './log-redaction';

describe('redactForLogging', () => {
  it('redacts credentials, authentication material, PII, and credential URLs', () => {
    expect(
      redactForLogging({
        password: 'plain-text',
        nested: {
          authorization: 'Bearer top-secret',
          cookie: 'bc.sid=secret',
          email: 'customer@example.com',
          safe: 'Bearer another-secret',
          endpoint: 'rediss://user:password@redis.internal:6379',
        },
      }),
    ).toEqual({
      password: '[REDACTED]',
      nested: {
        authorization: '[REDACTED]',
        cookie: '[REDACTED]',
        email: '[REDACTED]',
        safe: 'Bearer [REDACTED]',
        endpoint: 'rediss://[REDACTED]@redis.internal:6379',
      },
    });
  });

  it('does not throw on circular structures', () => {
    const value: Record<string, unknown> = {};
    value.self = value;

    expect(redactForLogging(value)).toEqual({ self: '[CIRCULAR]' });
  });
});
