import { Injectable } from '@nestjs/common';
import { StructuredLoggerService } from './structured-logger.service';

export type SecurityEventOutcome =
  'allowed' | 'denied' | 'failed' | 'succeeded';

export interface SecurityEvent {
  readonly action: string;
  readonly outcome: SecurityEventOutcome;
  readonly reasonCode?: string;
  readonly subjectId?: string;
}

const EVENT_CODE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeCode(value: string | undefined, fallback?: string) {
  if (value !== undefined && EVENT_CODE_PATTERN.test(value)) return value;
  return fallback;
}

@Injectable()
export class SecurityEventLoggerService {
  constructor(private readonly logger: StructuredLoggerService) {}

  record(event: SecurityEvent): void {
    this.logger.event('info', 'security_event', {
      category: 'security',
      action: safeCode(event.action, 'invalid_event_name'),
      outcome: event.outcome,
      reasonCode: safeCode(event.reasonCode),
      subjectId:
        event.subjectId !== undefined && UUID_PATTERN.test(event.subjectId)
          ? event.subjectId
          : undefined,
    });
  }
}
