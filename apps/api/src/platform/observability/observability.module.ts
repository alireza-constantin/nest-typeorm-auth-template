import { Global, Module } from '@nestjs/common';
import { HttpLoggingMiddleware } from './http-logging.middleware';
import { ProblemDetailsFilter } from './problem-details.filter';
import { RequestContextService } from './request-context.service';
import { RequestIdMiddleware } from './request-id.middleware';
import { SecurityEventLoggerService } from './security-event-logger.service';
import { StructuredLoggerService } from './structured-logger.service';

@Global()
@Module({
  providers: [
    RequestContextService,
    RequestIdMiddleware,
    StructuredLoggerService,
    SecurityEventLoggerService,
    HttpLoggingMiddleware,
    ProblemDetailsFilter,
  ],
  exports: [
    RequestContextService,
    RequestIdMiddleware,
    StructuredLoggerService,
    SecurityEventLoggerService,
    HttpLoggingMiddleware,
    ProblemDetailsFilter,
  ],
})
export class ObservabilityModule {}
