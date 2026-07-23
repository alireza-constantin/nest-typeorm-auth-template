export interface AuthenticatedUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

export interface SafeUserResponse {
  id: string;
  email: string;
  emailVerified: boolean;
}

export interface EmailVerificationMessage {
  email: string;
  token: string;
  expiresAt: Date;
}

export interface EmailVerificationDelivery {
  sendVerificationEmail(message: EmailVerificationMessage): Promise<void>;
}
