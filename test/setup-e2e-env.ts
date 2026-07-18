process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'postgres';
process.env.DB_NAME = 'better_commerce_test';
process.env.DB_SSL_MODE = 'disable';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.SESSION_SECRETS =
  'e2e-session-secret-that-is-long-enough-and-not-for-production';
process.env.SESSION_COOKIE_NAME = 'bc.e2e.sid';
process.env.SESSION_KEY_PREFIX = 'bc:e2e:sess:';
process.env.PUBLIC_REGISTRATION = 'true';
process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
process.env.TRUSTED_ORIGINS = 'http://localhost:3000';
process.env.LOGIN_THROTTLE_HMAC_SECRET =
  'e2e-abuse-secret-that-is-long-enough-and-not-for-production';
process.env.ABUSE_PROTECTION_KEY_PREFIX = 'bc:e2e:abuse:{auth}:';
process.env.LOGIN_THROTTLE_IDENTIFIER_LIMIT = '2';
process.env.LOGIN_THROTTLE_IP_LIMIT = '1000';
process.env.REGISTRATION_THROTTLE_IDENTIFIER_LIMIT = '100';
process.env.REGISTRATION_THROTTLE_IP_LIMIT = '1000';
