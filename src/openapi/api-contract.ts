import {
  type INestApplication,
  RequestMethod,
  VERSION_NEUTRAL,
  VersioningType,
} from '@nestjs/common';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import type { RuntimeEnvironment } from '../config';

export const API_GLOBAL_PREFIX = 'api';
export const API_VERSION = '1';
export const OPENAPI_UI_PATH = 'docs';
export const OPENAPI_JSON_PATH = 'docs/openapi.json';
export const OPENAPI_SESSION_SCHEME = 'sessionCookie';
export const OPENAPI_CSRF_SCHEME = 'csrfToken';

/**
 * Health probes are infrastructure contracts, not business API contracts. They
 * remain stable and unversioned while application endpoints live under
 * /api/v1.
 */
export function configureApiRouting(app: INestApplication): void {
  app.setGlobalPrefix(API_GLOBAL_PREFIX, {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: API_VERSION,
  });
}

export function isOpenApiEnabled(environment: RuntimeEnvironment): boolean {
  return environment !== 'production';
}

export function buildOpenApiConfiguration(): Omit<OpenAPIObject, 'paths'> {
  return new DocumentBuilder()
    .setTitle('Better Commerce API')
    .setDescription(
      [
        'Same-origin HTTP API for Better Commerce.',
        '',
        'Authentication uses an opaque server-side session. Browsers must send cookies with every request.',
        `Before any state-changing request, call GET /api/v1/auth/csrf and send the returned token in the x-csrf-token header.`,
        'Registration, login, and password changes rotate the session identifier, so obtain a fresh CSRF token afterward.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addCookieAuth(
      '__Host-bc.sid',
      {
        type: 'apiKey',
        in: 'cookie',
        description:
          'Production session cookie. The browser manages this HttpOnly cookie; JavaScript must not read it.',
      },
      OPENAPI_SESSION_SCHEME,
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-csrf-token',
        description:
          'Session-bound token returned by GET /api/v1/auth/csrf. Required for every state-changing request.',
      },
      OPENAPI_CSRF_SCHEME,
    )
    .build();
}

/**
 * Returns the generated document so CI and contract tests can inspect/export
 * the exact schema served by the development documentation endpoint.
 */
export function configureOpenApi(
  app: INestApplication,
  environment: RuntimeEnvironment,
): OpenAPIObject | undefined {
  if (!isOpenApiEnabled(environment)) return undefined;

  const document = SwaggerModule.createDocument(
    app,
    buildOpenApiConfiguration(),
    {
      deepScanRoutes: true,
      operationIdFactory: (controllerKey, methodKey) =>
        `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
    },
  );

  SwaggerModule.setup(OPENAPI_UI_PATH, app, document, {
    jsonDocumentUrl: OPENAPI_JSON_PATH,
    customSiteTitle: 'Better Commerce API',
    swaggerOptions: {
      persistAuthorization: false,
    },
  });

  return document;
}

export { VERSION_NEUTRAL };
