import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { OpenAPIObject } from '@nestjs/swagger';
import {
  buildOpenApiConfiguration,
  configureApiRouting,
  configureOpenApi,
  OPENAPI_CSRF_SCHEME,
  OPENAPI_SESSION_SCHEME,
  VERSION_NEUTRAL,
} from './api-contract';

@Controller('probe')
class VersionedProbeController {
  @Get()
  get(): string {
    return 'versioned';
  }
}

@Controller({ path: 'health', version: VERSION_NEUTRAL })
class NeutralHealthController {
  @Get('live')
  live(): string {
    return 'ok';
  }
}

describe('API contract bootstrap', () => {
  let app: INestApplication;
  let server: App;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [VersionedProbeController, NeutralHealthController],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApiRouting(app);
    document = configureOpenApi(app, 'test')!;
    await app.init();
    server = app.getHttpServer() as App;
  });

  afterAll(async () => app.close());

  it('routes application endpoints under /api/v1', async () => {
    await request(server).get('/api/v1/probe').expect(200, 'versioned');
    await request(server).get('/probe').expect(404);
  });

  it('keeps health endpoints unprefixed and version-neutral', async () => {
    await request(server).get('/health/live').expect(200, 'ok');
    await request(server).get('/api/v1/health/live').expect(404);
  });

  it('describes cookie sessions and the CSRF header', () => {
    const configuration = buildOpenApiConfiguration();
    const schemes = configuration.components?.securitySchemes;

    expect(schemes).toHaveProperty(OPENAPI_SESSION_SCHEME);
    expect(schemes).toHaveProperty(OPENAPI_CSRF_SCHEME);
    expect(configuration.info.description).toContain('/api/v1/auth/csrf');
    expect(configuration.info.description).toContain('x-csrf-token');
  });

  it('exports the same development document over HTTP', async () => {
    expect(document.paths).toHaveProperty('/api/v1/probe');
    await request(server)
      .get('/docs/openapi.json')
      .expect(200)
      .expect((response) => {
        const body = response.body as OpenAPIObject;
        expect(body.info.title).toBe('Better Commerce API');
        expect(body.paths).toHaveProperty('/api/v1/probe');
      });
  });

  it('does not configure OpenAPI in production', () => {
    expect(
      configureOpenApi({} as INestApplication, 'production'),
    ).toBeUndefined();
  });
});
