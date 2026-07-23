import 'express-session';

export type AuthenticationMethod = 'password' | 'email_otp';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    authVersion?: number;
    createdAt?: number;
    absoluteExpiresAt?: number;
    authenticatedAt?: number;
    authenticationMethod?: AuthenticationMethod;
    csrfSecret?: string;
  }
}

export interface AuthenticatedSessionInput {
  userId: string;
  authVersion: number;
  authenticationMethod: AuthenticationMethod;
}
