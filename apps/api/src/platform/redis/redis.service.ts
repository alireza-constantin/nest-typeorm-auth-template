import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';
import type { ApplicationConfiguration } from '../config';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: RedisClientType;

  constructor(config: ConfigService<ApplicationConfiguration, true>) {
    const redis = config.getOrThrow('redis', { infer: true });

    this.client = createClient({
      url: redis.url,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: redis.connectTimeoutMs,
        keepAlive: true,
        reconnectStrategy: (retries) => Math.min(100 * 2 ** retries, 3_000),
      },
    });

    this.client.on('error', (error: Error) => {
      // Deliberately omit the Redis URL because it may contain credentials.
      this.logger.error(`Redis client error: ${error.message}`);
    });
    this.client.on('connect', () => {
      this.logger.log('Redis connection started');
    });
    this.client.on('ready', () => {
      this.logger.log('Redis client is ready');
    });
    this.client.on('reconnecting', () => {
      this.logger.warn('Redis client is reconnecting');
    });
    this.client.on('end', () => {
      this.logger.log('Redis connection ended');
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
      this.logger.log('Redis startup check passed');
    } catch (error) {
      if (this.client.isOpen) {
        await this.client.disconnect();
      }

      const message = error instanceof Error ? error.message : 'unknown error';
      throw new Error(`Redis startup check failed: ${message}`);
    }
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    const reason = signal ? ` after ${signal}` : '';
    this.logger.log(`Closing Redis${reason}`);

    if (!this.client.isOpen) {
      this.logger.log('Redis connection is already closed');
      return;
    }

    try {
      if (this.client.isReady) {
        await this.client.quit();
      } else {
        await this.client.disconnect();
      }
      this.logger.log('Redis shutdown completed');
    } catch (error) {
      if (this.client.isOpen) {
        await this.client.disconnect();
      }
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Redis connection closed forcefully: ${message}`);
    }
  }
}
