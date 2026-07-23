import { SecurityEventLoggerService } from './security-event-logger.service';
import type { StructuredLoggerService } from './structured-logger.service';

describe('SecurityEventLoggerService', () => {
  it('logs only bounded machine codes and UUID subjects', () => {
    const event = jest.fn();
    const logger = new SecurityEventLoggerService({
      event,
    } as unknown as StructuredLoggerService);

    logger.record({
      action: 'login',
      outcome: 'failed',
      reasonCode: 'invalid_credentials',
      subjectId: '0195c9a0-b730-7c5d-bf44-1f103ef27b7a',
    });

    expect(event).toHaveBeenCalledWith('info', 'security_event', {
      category: 'security',
      action: 'login',
      outcome: 'failed',
      reasonCode: 'invalid_credentials',
      subjectId: '0195c9a0-b730-7c5d-bf44-1f103ef27b7a',
    });
  });

  it('does not admit free-form sensitive values into security fields', () => {
    const event = jest.fn();
    const logger = new SecurityEventLoggerService({
      event,
    } as unknown as StructuredLoggerService);

    logger.record({
      action: 'login for customer@example.test',
      outcome: 'denied',
      reasonCode: 'Bearer top-secret',
      subjectId: 'customer@example.test',
    });

    expect(JSON.stringify(event.mock.calls)).not.toContain(
      'customer@example.test',
    );
    expect(JSON.stringify(event.mock.calls)).not.toContain('top-secret');
  });
});
