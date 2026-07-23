import type { AuthenticatedUser } from '../auth.types';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

export {};
