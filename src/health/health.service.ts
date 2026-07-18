import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis';

export type DependencyName = 'database' | 'redis';
export type DependencyStatus = 'up' | 'down';

export interface ReadinessResult {
  status: 'ok' | 'error';
  checks: Record<DependencyName, { status: DependencyStatus }>;
}

const CHECK_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  async readiness(): Promise<ReadinessResult> {
    const [database, redis] = await Promise.all([
      this.check(() => this.dataSource.query('SELECT 1')),
      this.check(() => this.redis.ping()),
    ]);

    return {
      status: database === 'up' && redis === 'up' ? 'ok' : 'error',
      checks: {
        database: { status: database },
        redis: { status: redis },
      },
    };
  }

  private async check(
    operation: () => Promise<unknown>,
  ): Promise<DependencyStatus> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Health check timed out')),
            CHECK_TIMEOUT_MS,
          );
        }),
      ]);
      return 'up';
    } catch {
      return 'down';
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
