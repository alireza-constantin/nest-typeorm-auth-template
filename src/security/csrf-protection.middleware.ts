import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { CsrfService } from './csrf.service';
import { TrustedOriginService } from './trusted-origin.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfProtectionMiddleware implements NestMiddleware {
  constructor(
    private readonly csrf: CsrfService,
    private readonly origins: TrustedOriginService,
  ) {}

  use(request: Request, _response: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      next();
      return;
    }

    this.origins.assertTrustedRequest(request);
    this.csrf.assertValid(request);
    next();
  }
}
