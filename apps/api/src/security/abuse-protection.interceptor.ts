import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import { catchError, throwError } from 'rxjs';
import { AbuseLimitExceededException } from './abuse-protection.service';

@Injectable()
export class AbuseProtectionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof AbuseLimitExceededException) {
          response.setHeader('Retry-After', String(error.retryAfterSeconds));
        }
        return throwError(() => error);
      }),
    );
  }
}
