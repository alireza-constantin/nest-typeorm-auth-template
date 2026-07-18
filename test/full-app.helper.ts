import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Client } from 'pg';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { DataSource } from 'typeorm';
import type { RedisClientType } from 'redis';
import { AppModule } from '../src/app.module';
import { configureApiRouting, configureOpenApi } from '../src/openapi';
import { REDIS_CLIENT } from '../src/redis';
import { CsrfProtectionMiddleware } from '../src/security';
import {
  SESSION_ABSOLUTE_EXPIRY_MIDDLEWARE,
  SESSION_MIDDLEWARE,
} from '../src/session';

const TEST_DATABASE = 'better_commerce_test';
const TEST_REDIS_PREFIXES = ['bc:e2e:sess:', 'bc:e2e:abuse:'];

export async function ensureTestDatabase(): Promise<void> {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });
  await client.connect();
  try {
    const result = await client.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
      [TEST_DATABASE],
    );
    if (!result.rows[0]?.exists) {
      await client.query(`CREATE DATABASE ${TEST_DATABASE}`);
    }
  } finally {
    await client.end();
  }
}

export async function createFullApplication(): Promise<NestExpressApplication> {
  await ensureTestDatabase();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  const config = app.get(ConfigService);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(app.get(SESSION_MIDDLEWARE));
  app.use(app.get(SESSION_ABSOLUTE_EXPIRY_MIDDLEWARE));
  const csrfProtection = app.get(CsrfProtectionMiddleware);
  app.use(csrfProtection.use.bind(csrfProtection));
  app.use(json({ limit: '32kb', strict: true }));
  app.use(urlencoded({ extended: false, limit: '16kb' }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  configureApiRouting(app);
  configureOpenApi(app, config.getOrThrow('environment'));
  await app.init();
  return app;
}

export async function clearFullStackTestData(
  app: INestApplication,
): Promise<void> {
  const dataSource = app.get(DataSource);
  await dataSource.query(
    'TRUNCATE TABLE email_verification_tokens, password_credentials, users CASCADE',
  );

  const redis = app.get<RedisClientType>(REDIS_CLIENT);
  for (const prefix of TEST_REDIS_PREFIXES) {
    let cursor = '0';
    do {
      const result = await redis.scan(cursor, {
        MATCH: `${prefix}*`,
        COUNT: 100,
      });
      cursor = result.cursor;
      if (result.keys.length > 0) await redis.del(result.keys);
    } while (cursor !== '0');
  }
}
