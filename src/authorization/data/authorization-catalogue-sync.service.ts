import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BUILT_IN_ROLE_CATALOGUE,
  PERMISSION_CATALOGUE,
} from './authorization-catalogue';
import { Permission } from './permission.entity';
import { RolePermission } from './role-permission.entity';
import { Role } from './role.entity';

export interface AuthorizationCatalogueSyncResult {
  readonly permissionCount: number;
  readonly roleCount: number;
  readonly explicitRolePermissionCount: number;
}

/**
 * Keeps code-owned built-in roles exactly aligned with the approved matrix.
 * Historic permission rows are retained, but stale grants on system roles are
 * removed because leaving them active would silently preserve excess access.
 */
@Injectable()
export class AuthorizationCatalogueSyncService {
  constructor(private readonly dataSource: DataSource) {}

  async synchronize(): Promise<AuthorizationCatalogueSyncResult> {
    return this.dataSource.transaction(async (manager) => {
      const permissions = manager.getRepository(Permission);
      const roles = manager.getRepository(Role);
      const rolePermissions = manager.getRepository(RolePermission);

      await permissions.upsert(
        PERMISSION_CATALOGUE.map(({ key, description }) => ({
          key,
          description,
        })),
        ['key'],
      );

      await roles.upsert(
        BUILT_IN_ROLE_CATALOGUE.map(({ key, name, description }) => ({
          key,
          name,
          description,
          systemManaged: true,
        })),
        ['key'],
      );

      const persistedRoles = await roles.find({
        where: BUILT_IN_ROLE_CATALOGUE.map(({ key }) => ({ key })),
      });
      const roleIdByKey = new Map(
        persistedRoles.map((role) => [role.key, role.id]),
      );

      const desiredRolePermissions = BUILT_IN_ROLE_CATALOGUE.flatMap((role) => {
        const roleId = roleIdByKey.get(role.key);
        if (roleId === undefined) {
          throw new Error(`Built-in role was not persisted: ${role.key}`);
        }

        return role.permissionKeys.map((permissionKey) => ({
          roleId,
          permissionKey,
        }));
      });

      if (desiredRolePermissions.length > 0) {
        await rolePermissions
          .createQueryBuilder()
          .insert()
          .into(RolePermission)
          .values(desiredRolePermissions)
          .orIgnore()
          .execute();
      }

      for (const definition of BUILT_IN_ROLE_CATALOGUE) {
        const roleId = roleIdByKey.get(definition.key);
        if (roleId === undefined) continue;

        await rolePermissions
          .createQueryBuilder()
          .delete()
          .where('role_id = :roleId', { roleId })
          .andWhere('permission_key NOT IN (:...permissionKeys)', {
            permissionKeys: definition.permissionKeys,
          })
          .execute();
      }

      return {
        permissionCount: PERMISSION_CATALOGUE.length,
        roleCount: BUILT_IN_ROLE_CATALOGUE.length,
        explicitRolePermissionCount: desiredRolePermissions.length,
      };
    });
  }
}
