import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  isPermissionKey,
  type PermissionKey,
} from '../data/authorization-catalogue';
import { StaffProfile, StaffProfileStatus } from '../data/staff-profile.entity';
import {
  AuthorizationContext,
  AuthorizationContextLoadResult,
} from './authorization-context';

@Injectable()
export class AuthorizationContextService {
  constructor(
    @InjectRepository(StaffProfile)
    private readonly staffProfiles: Repository<StaffProfile>,
  ) {}

  /**
   * Loads fresh authorization facts from PostgreSQL for every administrative
   * request. No session or Redis authorization data participates in this read.
   */
  async loadForUser(userId: string): Promise<AuthorizationContextLoadResult> {
    let profile: StaffProfile | null;

    try {
      profile = await this.staffProfiles.findOne({
        where: { userId },
        relations: {
          roleAssignments: {
            role: {
              rolePermissions: true,
            },
          },
        },
      });
    } catch {
      throw new ServiceUnavailableException(
        'Authorization service unavailable',
      );
    }

    if (!profile) return { outcome: 'not_staff' };
    if (profile.status !== StaffProfileStatus.ACTIVE) {
      return { outcome: 'suspended' };
    }

    const assignments = profile.roleAssignments ?? [];
    if (assignments.length === 0) return { outcome: 'no_roles' };

    const roleKeys = new Set<string>();
    const permissions = new Set<PermissionKey>();

    try {
      for (const assignment of assignments) {
        roleKeys.add(assignment.role.key);
        for (const rolePermission of assignment.role.rolePermissions ?? []) {
          if (isPermissionKey(rolePermission.permissionKey)) {
            permissions.add(rolePermission.permissionKey);
          }
        }
      }
    } catch {
      // An incomplete or invalid relation graph must never grant access.
      throw new ServiceUnavailableException(
        'Authorization service unavailable',
      );
    }

    const context: AuthorizationContext = Object.freeze({
      userId,
      staffStatus: StaffProfileStatus.ACTIVE,
      roleKeys: Object.freeze([...roleKeys].sort()),
      permissions: Object.freeze([...permissions].sort()),
    });

    return { outcome: 'active', context };
  }
}
