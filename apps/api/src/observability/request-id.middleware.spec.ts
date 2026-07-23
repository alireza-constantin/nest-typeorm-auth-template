import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from './request-context.service';
import {
  isValidRequestId,
  RequestIdMiddleware,
  REQUEST_ID_HEADER,
} from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  it('retains a strictly valid inbound request ID and exposes it in context', () => {
    const context = new RequestContextService();
    const middleware = new RequestIdMiddleware(context);
    const setHeader = jest.fn();
    const next = jest.fn(() => {
      expect(context.getRequestId()).toBe('edge-01:request_42');
    }) as NextFunction;

    middleware.use(
      {
        get: jest.fn().mockReturnValue('edge-01:request_42'),
      } as unknown as Request,
      { setHeader } as unknown as Response,
      next,
    );

    expect(setHeader).toHaveBeenCalledWith(
      REQUEST_ID_HEADER,
      'edge-01:request_42',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each(['', 'contains spaces', 'line\nbreak', `a${'b'.repeat(128)}`, '💥'])(
    'replaces an invalid inbound request ID: %p',
    (inbound) => {
      const context = new RequestContextService();
      const middleware = new RequestIdMiddleware(context);
      const setHeader = jest.fn();

      middleware.use(
        { get: jest.fn().mockReturnValue(inbound) } as unknown as Request,
        { setHeader } as unknown as Response,
        (() => undefined) as NextFunction,
      );

      const generated = (setHeader.mock.calls as unknown[][])
        .at(0)
        ?.at(1) as string;
      expect(generated).not.toBe(inbound);
      expect(isValidRequestId(generated)).toBe(true);
    },
  );

  it('keeps context across asynchronous work', async () => {
    const context = new RequestContextService();

    await context.run({ requestId: 'async-request' }, async () => {
      await Promise.resolve();
      expect(context.getRequestId()).toBe('async-request');
    });
  });
});
