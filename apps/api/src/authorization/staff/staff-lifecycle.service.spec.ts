import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User, UserStatus } from '../../users/user.entity';
import {
  PermissionKey,
  Role,
  RoleKey,
  StaffProfile,
  StaffProfileStatus,
} from '../data';
import { StaffLifecycleService } from './staff-lifecycle.service';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  authVersion: 0,
  status: UserStatus.ACTIVE,
} as User;
const ownerRole = { key: RoleKey.OWNER, rolePermissions: [] } as Role;
const analystRole = { key: RoleKey.ANALYST, rolePermissions: [] } as Role;

function profileQuery(profile: StaffProfile) {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(profile),
  };
}

describe('StaffLifecycleService owner protections', () => {
  it('requires owner authority before removing an owner role', async () => {
    const profile = {
      userId: user.id,
      status: StaffProfileStatus.ACTIVE,
      roleAssignments: [{ role: ownerRole }],
    } as StaffProfile;
    const query = profileQuery(profile);
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === User)
          return { findOne: jest.fn().mockResolvedValue(user) };
        if (entity === StaffProfile)
          return { createQueryBuilder: jest.fn().mockReturnValue(query) };
        if (entity === Role)
          return { find: jest.fn().mockResolvedValue([analystRole]) };
        return {};
      }),
      query: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
        callback(manager),
      ),
    } as unknown as DataSource;
    const service = new StaffLifecycleService(dataSource);

    await expect(
      service.replaceRoles(
        {
          actor: { userId: user.id, permissions: [PermissionKey.ADMIN_ACCESS] },
          requestId: 'request',
        },
        user.id,
        [RoleKey.ANALYST],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('requires owner authority before suspending an owner', async () => {
    const profile = {
      userId: user.id,
      status: StaffProfileStatus.ACTIVE,
      roleAssignments: [{ role: ownerRole }],
    } as StaffProfile;
    const query = profileQuery(profile);
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === User)
          return { findOne: jest.fn().mockResolvedValue(user) };
        if (entity === StaffProfile)
          return { createQueryBuilder: jest.fn().mockReturnValue(query) };
        return {};
      }),
      query: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
        callback(manager),
      ),
    } as unknown as DataSource;
    const service = new StaffLifecycleService(dataSource);

    await expect(
      service.suspend(
        {
          actor: { userId: user.id, permissions: [PermissionKey.ADMIN_ACCESS] },
          requestId: 'request',
        },
        user.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(manager.query).not.toHaveBeenCalled();
  });
});
