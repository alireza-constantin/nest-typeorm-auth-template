import {
  ExecutionContext,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SecurityEventLoggerService } from '../../../platform/observability';
import { PermissionKey, StaffProfileStatus } from '../data';
import { AdminApi } from './admin-api.decorator';
import { AdminAuthorizationGuard } from './admin-authorization.guard';
import { AuthorizationContextLoadResult } from './authorization-context';
import { AuthorizationContextService } from './authorization-context.service';
import { RequirePermissions } from './require-permissions.decorator';

const USER_ID = '10000000-0000-4000-8000-000000000001';

@AdminApi()
class TestAdminController {
  @RequirePermissions(PermissionKey.STAFF_READ)
  allPermissions(): void {}

  @RequirePermissions({
    mode: 'any',
    permissions: [PermissionKey.STAFF_READ, PermissionKey.ROLES_READ],
  })
  anyPermission(): void {}

  missingDeclaration(): void {}
}

class PublicController {
  adminLookingPath(): void {}
}

function executionContext(
  controller: new () => object,
  handlerName: string,
  request: Partial<Request> = {},
): ExecutionContext {
  const handler = Reflect.get(
    controller.prototype as object,
    handlerName,
  ) as () => void;

  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function activeResult(
  permissions: readonly PermissionKey[],
): AuthorizationContextLoadResult {
  return {
    outcome: 'active',
    context: {
      userId: USER_ID,
      staffStatus: StaffProfileStatus.ACTIVE,
      roleKeys: ['support_agent'],
      permissions,
    },
  };
}

describe('AdminAuthorizationGuard', () => {
  let loadForUser: jest.Mock<Promise<AuthorizationContextLoadResult>, [string]>;
  let record: jest.Mock;
  let guard: AdminAuthorizationGuard;

  beforeEach(() => {
    loadForUser = jest.fn<Promise<AuthorizationContextLoadResult>, [string]>();
    record = jest.fn();
    guard = new AdminAuthorizationGuard(
      new Reflector(),
      { loadForUser } as unknown as AuthorizationContextService,
      { record } as unknown as SecurityEventLoggerService,
    );
  });

  it('ignores non-administrative handlers without inspecting their route', async () => {
    const context = executionContext(PublicController, 'adminLookingPath');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(loadForUser).not.toHaveBeenCalled();
  });

  it('returns 401 defensively when the authentication guard supplied no user', async () => {
    const context = executionContext(TestAdminController, 'allPermissions');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(loadForUser).not.toHaveBeenCalled();
  });

  it('fails closed when an administrative handler has no permission declaration', async () => {
    const context = executionContext(
      TestAdminController,
      'missingDeclaration',
      { authUser: { id: USER_ID } } as Partial<Request>,
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(loadForUser).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: 'missing_permission_metadata' }),
    );
  });

  it.each(['not_staff', 'suspended', 'no_roles'] as const)(
    'returns 403 for %s',
    async (outcome) => {
      loadForUser.mockResolvedValue({ outcome });
      const context = executionContext(TestAdminController, 'allPermissions', {
        authUser: { id: USER_ID },
      } as Partial<Request>);

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ reasonCode: outcome }),
      );
    },
  );

  it('requires admin.access in addition to the declared permission', async () => {
    loadForUser.mockResolvedValue(activeResult([PermissionKey.STAFF_READ]));
    const context = executionContext(TestAdminController, 'allPermissions', {
      authUser: { id: USER_ID },
    } as Partial<Request>);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: 'missing_admin_access' }),
    );
  });

  it('enforces all permissions and attaches the server-derived context', async () => {
    const loaded = activeResult([
      PermissionKey.ADMIN_ACCESS,
      PermissionKey.STAFF_READ,
    ]);
    loadForUser.mockResolvedValue(loaded);
    const request = { authUser: { id: USER_ID } } as Partial<Request>;
    const context = executionContext(
      TestAdminController,
      'allPermissions',
      request,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.authorization).toBe(
      loaded.outcome === 'active' ? loaded.context : undefined,
    );
  });

  it('supports explicit any-permission semantics', async () => {
    loadForUser.mockResolvedValue(
      activeResult([PermissionKey.ADMIN_ACCESS, PermissionKey.ROLES_READ]),
    );
    const context = executionContext(TestAdminController, 'anyPermission', {
      authUser: { id: USER_ID },
    } as Partial<Request>);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('maps authorization dependency failures to a generic 503 and logs them', async () => {
    loadForUser.mockRejectedValue(
      new Error('database credentials leaked here'),
    );
    const context = executionContext(TestAdminController, 'allPermissions', {
      authUser: { id: USER_ID },
    } as Partial<Request>);

    await expect(guard.canActivate(context)).rejects.toEqual(
      expect.objectContaining({
        constructor: ServiceUnavailableException,
        message: 'Authorization service unavailable',
      }),
    );
    expect(record).toHaveBeenCalledWith({
      action: 'admin.authorization_dependency',
      outcome: 'failed',
      reasonCode: 'unavailable',
      subjectId: USER_ID,
    });
  });
});
