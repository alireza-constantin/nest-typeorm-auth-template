import type { AuthorizationContext } from './authorization-context';

declare global {
  namespace Express {
    interface Request {
      authorization?: AuthorizationContext;
    }
  }
}

export {};
