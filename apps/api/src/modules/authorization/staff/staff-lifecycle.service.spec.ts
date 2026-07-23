import { ForbiddenException } from '@nestjs/common';
import type { IdentityAdministration } from '../../identity';
import type {
  DatabaseTransactionContext,
  DatabaseTransactionRunner,
} from '../../../platform/database';
import {
  AuthorizationPersistenceService,
  PermissionKey,
  Role,
  RoleKey,
  StaffProfile,
  StaffProfileStatus,
} from '../data';
import { StaffLifecycleService } from './staff-lifecycle.service';

const userId = '00000000-0000-4000-8000-000000000001';
const identity = { id: userId, email: 'owner@example.test' };
const ownerRole = { key: RoleKey.OWNER, rolePermissions: [] } as Role;
const analystRole = { key: RoleKey.ANALYST, rolePermissions: [] } as Role;
const transaction = {} as DatabaseTransactionContext;

function transactionRunner(): DatabaseTransactionRunner {
  return {
    run: <T>(
      work: (context: DatabaseTransactionContext) => Promise<T>,
    ): Promise<T> => work(transaction),
  } as unknown as DatabaseTransactionRunner;
}

function identityAdministration(): IdentityAdministration {
  return {
    lockActiveById: jest
      .fn()
      .mockResolvedValue({ outcome: 'active', identity }),
  } as unknown as IdentityAdministration;
}

describe('StaffLifecycleService owner protections', () => {
  it('requires owner authority before removing an owner role', async () => {
    const profile = {
      userId,
      status: StaffProfileStatus.ACTIVE,
      roleAssignments: [{ role: ownerRole }],
    } as StaffProfile;
    const acquireOwnerLock = jest.fn();
    const persistence = {
      findProfileWithRoles: jest.fn().mockResolvedValue(profile),
      findSystemRolesByKeys: jest.fn().mockResolvedValue([analystRole]),
      acquireOwnerLock,
    } as unknown as AuthorizationPersistenceService;
    const service = new StaffLifecycleService(
      transactionRunner(),
      persistence,
      identityAdministration(),
    );

    await expect(
      service.replaceRoles(
        {
          actor: { userId, permissions: [PermissionKey.ADMIN_ACCESS] },
          requestId: 'request',
        },
        userId,
        [RoleKey.ANALYST],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(acquireOwnerLock).not.toHaveBeenCalled();
  });

  it('requires owner authority before suspending an owner', async () => {
    const profile = {
      userId,
      status: StaffProfileStatus.ACTIVE,
      roleAssignments: [{ role: ownerRole }],
    } as StaffProfile;
    const acquireOwnerLock = jest.fn();
    const persistence = {
      findProfileWithRoles: jest.fn().mockResolvedValue(profile),
      acquireOwnerLock,
    } as unknown as AuthorizationPersistenceService;
    const service = new StaffLifecycleService(
      transactionRunner(),
      persistence,
      identityAdministration(),
    );

    await expect(
      service.suspend(
        {
          actor: { userId, permissions: [PermissionKey.ADMIN_ACCESS] },
          requestId: 'request',
        },
        userId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(acquireOwnerLock).not.toHaveBeenCalled();
  });
});
