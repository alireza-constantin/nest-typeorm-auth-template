import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { HealthController } from '../src/platform/health/health.controller';
import {
  HealthService,
  type ReadinessResult,
} from '../src/platform/health/health.service';

describe('Health endpoints', () => {
  let app: INestApplication;
  let server: App;
  const readiness = jest.fn<Promise<ReadinessResult>, []>();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: { readiness } }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as App;
  });

  beforeEach(() => jest.clearAllMocks());

  afterAll(async () => app.close());

  it('keeps liveness independent from PostgreSQL and Redis', async () => {
    await request(server)
      .get('/health/live')
      .expect(200)
      .expect({ status: 'ok' });

    expect(readiness).not.toHaveBeenCalled();
  });

  it('reports ready when both authoritative stores are available', async () => {
    readiness.mockResolvedValue({
      status: 'ok',
      checks: {
        database: { status: 'up' },
        redis: { status: 'up' },
      },
    });

    await request(server)
      .get('/health/ready')
      .expect(200)
      .expect({
        status: 'ok',
        checks: {
          database: { status: 'up' },
          redis: { status: 'up' },
        },
      });
  });

  it('removes the instance from service when a dependency is down', async () => {
    readiness.mockResolvedValue({
      status: 'error',
      checks: {
        database: { status: 'up' },
        redis: { status: 'down' },
      },
    });

    await request(server)
      .get('/health/ready')
      .expect(503)
      .expect({
        status: 'error',
        checks: {
          database: { status: 'up' },
          redis: { status: 'down' },
        },
      });
  });
});
