export const AUTHENTICATED_USER_REQUEST_KEY = 'authUser';

export const PASSWORD_HASH_OPTIONS = {
  type: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const SESSION_ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export const IS_PUBLIC_KEY = 'auth:is-public';

export const EMAIL_VERIFICATION_DELIVERY = Symbol(
  'EMAIL_VERIFICATION_DELIVERY',
);
