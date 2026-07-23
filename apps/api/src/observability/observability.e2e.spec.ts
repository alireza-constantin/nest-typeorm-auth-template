import { Controller, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import { json } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types';
import { HttpLoggingMiddleware } from './http-logging.middleware';
import { ProblemDetailsFilter } from './problem-details.filter';
import { RequestContextService } from './request-context.service';
import { RequestIdMiddleware } from './request-id.middleware';
import { StructuredLoggerService } from './structured-logger.service';

@Controller('probe')
class ProbeController {
  @Post()
  create() {
    return { ok: true };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('observability HTTP boundary', () => {
  let app: INestApplication;
  const event = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
      providers: [
        RequestContextService,
        RequestIdMiddleware,
        HttpLoggingMiddleware,
        ProblemDetailsFilter,
        { provide: StructuredLoggerService, useValue: { event } },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    const ids = app.get(RequestIdMiddleware);
    const httpLogs = app.get(HttpLoggingMiddleware);
    app.use(ids.use.bind(ids));
    app.use(httpLogs.use.bind(httpLogs));
    app.use(json({ strict: true }));
    app.useGlobalFilters(app.get(ProblemDetailsFilter));
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => event.mockClear());

  it('normalizes malformed JSON and still emits one completion log', async () => {
    const response = await request(app.getHttpServer() as App)
      .post('/probe')
      .set('content-type', 'application/json')
      .send('{ invalid')
      .expect(400);

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 400,
        requestId: response.headers['x-request-id'],
      }),
    );
    expect(event).toHaveBeenCalledTimes(1);
  });
});
