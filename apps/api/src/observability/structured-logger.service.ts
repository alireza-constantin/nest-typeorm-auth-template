import { Injectable, type LoggerService } from '@nestjs/common';
import { RequestContextService } from './request-context.service';
import { redactForLogging } from './log-redaction';

export type LogLevel =
  'debug' | 'error' | 'fatal' | 'info' | 'verbose' | 'warn';

export interface StructuredLogRecord {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly requestId?: string;
  readonly context?: string;
  readonly data?: unknown;
}

@Injectable()
export class StructuredLoggerService implements LoggerService {
  constructor(private readonly requestContext: RequestContextService) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  event(
    level: LogLevel,
    message: string,
    data?: Readonly<Record<string, unknown>>,
  ): void {
    this.emit({
      timestamp: new Date().toISOString(),
      level,
      message,
      requestId: this.requestContext.getRequestId(),
      data: data === undefined ? undefined : redactForLogging(data),
    });
  }

  protected emit(record: StructuredLogRecord): void {
    const line = `${JSON.stringify(record)}\n`;
    if (record.level === 'error' || record.level === 'fatal') {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  }

  private write(
    level: LogLevel,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const possibleContext = optionalParams.at(-1);
    const context =
      typeof possibleContext === 'string' && optionalParams.length > 0
        ? possibleContext
        : undefined;
    const data = context ? optionalParams.slice(0, -1) : optionalParams;

    this.emit({
      timestamp: new Date().toISOString(),
      level,
      message:
        typeof message === 'string'
          ? (redactForLogging(message) as string)
          : 'Structured log event',
      requestId: this.requestContext.getRequestId(),
      context,
      data: redactForLogging(
        typeof message === 'string' ? data : [message, ...data],
      ),
    });
  }
}
