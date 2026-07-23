import { applyDecorators } from '@nestjs/common';
import { ApiCookieAuth, ApiSecurity } from '@nestjs/swagger';
import { OPENAPI_CSRF_SCHEME, OPENAPI_SESSION_SCHEME } from './api-contract';

export const ApiSessionAuthenticated = () =>
  applyDecorators(ApiCookieAuth(OPENAPI_SESSION_SCHEME));

export const ApiCsrfProtected = () =>
  applyDecorators(ApiSecurity(OPENAPI_CSRF_SCHEME));
