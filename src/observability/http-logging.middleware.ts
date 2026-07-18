import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { StructuredLoggerService } from './structured-logger.service';

function routeTemplate(request: Request): string {
  const route = request.route as { path?: unknown } | undefined;
  const path = typeof route?.path === 'string' ? route.path : 'unmatched';
  return `${request.baseUrl || ''}${path}` || '/';
}

@Injectable()
export class HttpLoggingMiddleware implements NestMiddleware {
  constructor(private readonly logger: StructuredLoggerService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    let recorded = false;

    const record = (outcome: 'aborted' | 'completed') => {
      if (recorded) return;
      recorded = true;
      response.removeListener('finish', onFinish);
      response.removeListener('close', onClose);

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const authUser = (
        request as Request & {
          authUser?: { id?: unknown };
        }
      ).authUser;

      this.logger.event('info', 'http_request_completed', {
        method: request.method,
        route: routeTemplate(request),
        statusCode: response.statusCode,
        durationMs: Number(durationMs.toFixed(3)),
        outcome,
        userId: typeof authUser?.id === 'string' ? authUser.id : undefined,
      });
    };

    const onFinish = () => record('completed');
    const onClose = () => record('aborted');
    response.once('finish', onFinish);
    response.once('close', onClose);
    next();
  }
}
