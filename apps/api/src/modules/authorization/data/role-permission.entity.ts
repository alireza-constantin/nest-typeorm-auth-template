import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Permission } from './permission.entity';
import { Role } from './role.entity';

/** A permission is granted only by an explicit row; there are no wildcards. */
@Entity({ name: 'role_permissions' })
@Index('IDX_role_permissions_permission_key', ['permissionKey'])
export class RolePermission {
  @PrimaryColumn({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @PrimaryColumn({ name: 'permission_key', type: 'varchar', length: 100 })
  permissionKey: string;

  @ManyToOne(() => Role, (role) => role.rolePermissions, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @ManyToOne(() => Permission, (permission) => permission.rolePermissions, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'permission_key', referencedColumnName: 'key' })
  permission: Permission;
}
