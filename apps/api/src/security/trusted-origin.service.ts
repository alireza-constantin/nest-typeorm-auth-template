import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { SECURITY_CONFIGURATION } from './security.constants';
import type { SecurityConfiguration } from './security.config';

@Injectable()
export class TrustedOriginService {
  constructor(
    @Inject(SECURITY_CONFIGURATION)
    private readonly configuration: SecurityConfiguration,
  ) {}

  isTrusted(value: string): boolean {
    if (value === 'null') {
      return false;
    }

    try {
      return this.configuration.trustedOrigins.has(new URL(value).origin);
    } catch {
      return false;
    }
  }

  assertTrustedRequest(request: Request): void {
    const origin = request.get('origin');
    const referer = request.get('referer');

    // Browser cookie requests must supply at least one browser-controlled source
    // header. Requiring this also prevents non-browser clients from accidentally
    // bypassing the CSRF boundary.
    if (!origin && !referer) {
      throw new ForbiddenException('Request origin is required');
    }

    if (origin && !this.isTrusted(origin)) {
      throw new ForbiddenException('Request origin is not trusted');
    }

    if (referer && !this.isTrusted(referer)) {
      throw new ForbiddenException('Request referrer is not trusted');
    }

    const fetchSite = request.get('sec-fetch-site');
    if (fetchSite === 'cross-site') {
      throw new ForbiddenException('Cross-site request is not allowed');
    }
  }
}
