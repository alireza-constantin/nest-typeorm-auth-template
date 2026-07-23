import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SecurityEventLoggerService } from '../../observability';
import { PermissionKey } from '../data/authorization-catalogue';
import {
  ADMIN_API_METADATA,
  REQUIRED_PERMISSIONS_METADATA,
} from './authorization.constants';
import {
  AuthorizationContextLoadResult,
  PermissionRequirement,
} from './authorization-context';
import { AuthorizationContextService } from './authorization-context.service';

@Injectable()
export class AdminAuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationContextService,
    private readonly securityEvents: SecurityEventLoggerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isAdminApi = this.reflector.getAllAndOverride<boolean>(
      ADMIN_API_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!isAdminApi) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.authUser?.id;
    if (!userId) throw new UnauthorizedException();

    const requirement = this.reflector.get<PermissionRequirement>(
      REQUIRED_PERMISSIONS_METADATA,
      context.getHandler(),
    );
    if (
      !requirement ||
      requirement.permissions.length === 0 ||
      (requirement.mode !== 'all' && requirement.mode !== 'any')
    ) {
      this.deny(userId, 'missing_permission_metadata');
    }

    let loaded: AuthorizationContextLoadResult;
    try {
      loaded = await this.authorization.loadForUser(userId);
    } catch {
      this.recordSecurityEvent({
        action: 'admin.authorization_dependency',
        outcome: 'failed',
        reasonCode: 'unavailable',
        subjectId: userId,
      });
      throw new ServiceUnavailableException(
        'Authorization service unavailable',
      );
    }

    if (loaded.outcome !== 'active') {
      this.deny(userId, loaded.outcome);
    }

    const effectivePermissions = new Set(loaded.context.permissions);
    if (!effectivePermissions.has(PermissionKey.ADMIN_ACCESS)) {
      this.deny(userId, 'missing_admin_access');
    }

    const hasDeclaredPermissions =
      requirement.mode === 'any'
        ? requirement.permissions.some((permission) =>
            effectivePermissions.has(permission),
          )
        : requirement.permissions.every((permission) =>
            effectivePermissions.has(permission),
          );

    if (!hasDeclaredPermissions) {
      this.deny(userId, 'insufficient_permission');
    }

    request.authorization = loaded.context;
    return true;
  }

  private deny(userId: string, reasonCode: string): never {
    this.recordSecurityEvent({
      action: 'admin.access',
      outcome: 'denied',
      reasonCode,
      subjectId: userId,
    });
    throw new ForbiddenException();
  }

  private recordSecurityEvent(
    event: Parameters<SecurityEventLoggerService['record']>[0],
  ): void {
    try {
      this.securityEvents.record(event);
    } catch {
      // Logging failure must not replace the intended fail-closed HTTP result.
    }
  }
}
