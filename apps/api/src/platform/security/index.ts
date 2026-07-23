export { CSRF_HEADER_NAME, SECURITY_CONFIGURATION } from './security.constants';
export {
  type AbuseProtectionConfiguration,
  buildSecurityConfiguration,
  type DualIdentifierThrottleConfiguration,
  normalizeTrustedOrigin,
  type SecurityConfiguration,
  type VerificationRequestThrottleConfiguration,
} from './security.config';
export { AbuseProtectionInterceptor } from './abuse-protection.interceptor';
export {
  AbuseLimitExceededException,
  AbuseProtectionService,
  normalizeAccountIdentifier,
  requestIpAddress,
} from './abuse-protection.service';
export { CsrfProtectionMiddleware } from './csrf-protection.middleware';
export { CsrfService } from './csrf.service';
export { SecurityModule } from './security.module';
export { TrustedOriginService } from './trusted-origin.service';
