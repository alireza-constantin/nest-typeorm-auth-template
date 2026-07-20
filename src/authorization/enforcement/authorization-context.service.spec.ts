import { ServiceUnavailableException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PermissionKey, StaffProfile, StaffProfileStatus } from '../data';
import { AuthorizationContextService } from './authorization-context.service';

const USER_ID = '10000000-0000-4000-8000-000000000001';

describe('AuthorizationContextService', () => {
  let findOne: jest.Mock;
  let service: AuthorizationContextService;

  beforeEach(() => {
    findOne = jest.fn();
    service = new AuthorizationContextService({
      findOne,
    } as unknown as Repository<StaffProfile>);
  });

  it('loads and unions fresh role permissions deterministically', async () => {
    findOne.mockResolvedValue({
      userId: USER_ID,
      status: StaffProfileStatus.ACTIVE,
      roleAssignments: [
        {
          role: {
            key: 'support_agent',
            rolePermissions: [
              { permissionKey: PermissionKey.STAFF_READ },
              { permissionKey: PermissionKey.ADMIN_ACCESS },
            ],
          },
        },
        {
          role: {
            key: 'analyst',
            rolePermissions: [
              { permissionKey: PermissionKey.ADMIN_ACCESS },
              { permissionKey: PermissionKey.REPORTS_READ },
              { permissionKey: 'unknown.permission' },
            ],
          },
        },
      ],
    });

    await expect(service.loadForUser(USER_ID)).resolves.toEqual({
      outcome: 'active',
      context: {
        userId: USER_ID,
        staffStatus: StaffProfileStatus.ACTIVE,
        roleKeys: ['analyst', 'support_agent'],
        permissions: [
          PermissionKey.ADMIN_ACCESS,
          PermissionKey.REPORTS_READ,
          PermissionKey.STAFF_READ,
        ],
      },
    });
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('distinguishes absent, suspended, and role-less staff', async () => {
    findOne.mockResolvedValueOnce(null);
    await expect(service.loadForUser(USER_ID)).resolves.toEqual({
      outcome: 'not_staff',
    });

    findOne.mockResolvedValueOnce({ status: StaffProfileStatus.SUSPENDED });
    await expect(service.loadForUser(USER_ID)).resolves.toEqual({
      outcome: 'suspended',
    });

    findOne.mockResolvedValueOnce({
      status: StaffProfileStatus.ACTIVE,
      roleAssignments: [],
    });
    await expect(service.loadForUser(USER_ID)).resolves.toEqual({
      outcome: 'no_roles',
    });
  });

  it('fails closed with 503 when PostgreSQL cannot be queried', async () => {
    findOne.mockRejectedValue(new Error('database unavailable'));

    await expect(service.loadForUser(USER_ID)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails closed on an incomplete relation graph', async () => {
    findOne.mockResolvedValue({
      status: StaffProfileStatus.ACTIVE,
      roleAssignments: [{}],
    });

    await expect(service.loadForUser(USER_ID)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
