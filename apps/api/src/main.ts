import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import {
  HttpLoggingMiddleware,
  ProblemDetailsFilter,
  RequestIdMiddleware,
  StructuredLoggerService,
} from './platform/observability';
import { configureApiRouting, configureOpenApi } from './platform/openapi';
import { CsrfProtectionMiddleware } from './platform/security';
import {
  SESSION_ABSOLUTE_EXPIRY_MIDDLEWARE,
  SESSION_MIDDLEWARE,
} from './modules/identity/session';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  const config = app.get(ConfigService);
  const environment = config.getOrThrow<'development' | 'test' | 'production'>(
    'environment',
  );
  const trustProxyHops = config.get<number>('trustProxyHops') ?? 0;

  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  const requestId = app.get(RequestIdMiddleware);
  const httpLogging = app.get(HttpLoggingMiddleware);
  app.useLogger(app.get(StructuredLoggerService));
  app.use(requestId.use.bind(requestId));
  app.use(httpLogging.use.bind(httpLogging));

  // Swagger UI requires inline bootstrap assets. It is unavailable in
  // production, where Helmet's default CSP remains fully enabled.
  app.use(
    helmet({
      contentSecurityPolicy: environment === 'production' ? undefined : false,
    }),
  );
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
  app.useGlobalFilters(app.get(ProblemDetailsFilter));
  configureApiRouting(app);
  configureOpenApi(app, environment);
  app.enableShutdownHooks();

  await app.listen(config.getOrThrow<number>('port'));
}
void bootstrap();
