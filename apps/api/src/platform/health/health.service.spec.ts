import type { DataSource } from 'typeorm';
import type { RedisService } from '../redis';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const createService = (
    query: jest.Mock = jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    ping: jest.Mock = jest.fn().mockResolvedValue(undefined),
  ) =>
    new HealthService(
      { query } as unknown as DataSource,
      { ping } as unknown as RedisService,
    );

  it('reports ready only when PostgreSQL and Redis respond', async () => {
    await expect(createService().readiness()).resolves.toEqual({
      status: 'ok',
      checks: {
        database: { status: 'up' },
        redis: { status: 'up' },
      },
    });
  });

  it.each([
    [
      'database',
      jest.fn().mockRejectedValue(new Error('database unavailable')),
      jest.fn().mockResolvedValue(undefined),
    ],
    [
      'redis',
      jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      jest.fn().mockRejectedValue(new Error('redis unavailable')),
    ],
  ])('fails readiness when %s is unavailable', async (_name, query, ping) => {
    await expect(createService(query, ping).readiness()).resolves.toMatchObject(
      {
        status: 'error',
      },
    );
  });

  it('does not leak dependency error details', async () => {
    const result = await createService(
      jest.fn().mockRejectedValue(new Error('postgres://secret@host/database')),
    ).readiness();

    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
