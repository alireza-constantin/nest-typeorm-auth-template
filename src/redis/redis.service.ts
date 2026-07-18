import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;

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

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: RedisClientType;

  constructor(config: ConfigService) {
    const url = required(config, 'REDIS_URL');
    const connectTimeout = positiveInteger(
      config,
      'REDIS_CONNECT_TIMEOUT_MS',
      DEFAULT_CONNECT_TIMEOUT_MS,
    );

    this.client = createClient({
      url,
      disableOfflineQueue: true,
      socket: {
        connectTimeout,
        keepAlive: true,
        reconnectStrategy: (retries) => Math.min(100 * 2 ** retries, 3_000),
      },
    });

    this.client.on('error', (error: Error) => {
      // Deliberately omit the Redis URL because it may contain credentials.
      this.logger.error(`Redis client error: ${error.message}`);
    });
  }

  getClient(): RedisClientType {
    return this.client;
  }

  isReady(): boolean {
    return this.client.isReady;
  }

  async ping(): Promise<void> {
    if (!this.client.isReady) {
      throw new Error('Redis is not ready');
    }

    const response = await this.client.ping();

    if (response !== 'PONG') {
      throw new Error('Redis health check returned an unexpected response');
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      await this.ping();
      this.logger.log('Redis connection is ready');
    } catch (error) {
      if (this.client.isOpen) {
        await this.client.disconnect();
      }

      const message = error instanceof Error ? error.message : 'unknown error';
      throw new Error(`Redis startup check failed: ${message}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.client.isOpen) {
      return;
    }

    try {
      if (this.client.isReady) {
        await this.client.quit();
      } else {
        await this.client.disconnect();
      }
    } catch (error) {
      if (this.client.isOpen) {
        await this.client.disconnect();
      }
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Redis connection closed forcefully: ${message}`);
    }
  }
}
