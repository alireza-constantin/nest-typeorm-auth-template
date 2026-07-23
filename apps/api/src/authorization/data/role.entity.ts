import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RolePermission } from './role-permission.entity';
import { StaffRoleAssignment } from './staff-role-assignment.entity';

@Entity({ name: 'roles' })
@Index('UQ_roles_key', ['key'], { unique: true })
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 500 })
  description: string;

  @Column({ name: 'system_managed', type: 'boolean', default: true })
  systemManaged: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => RolePermission, (rolePermission) => rolePermission.role)
  rolePermissions?: RolePermission[];

  @OneToMany(() => StaffRoleAssignment, (assignment) => assignment.role)
  staffAssignments?: StaffRoleAssignment[];
}
