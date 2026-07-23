import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from './identity-user.persistence';
import { Role } from './role.entity';
import { StaffProfile } from './staff-profile.entity';

@Entity({ name: 'staff_role_assignments' })
@Index('IDX_staff_role_assignments_role_id', ['roleId'])
export class StaffRoleAssignment {
  @PrimaryColumn({ name: 'staff_user_id', type: 'uuid' })
  staffUserId: string;

  @PrimaryColumn({ name: 'role_id', type: 'uuid' })
  roleId: string;

  /** Null is reserved for the out-of-band first-owner bootstrap. */
  @Column({ name: 'assigned_by_user_id', type: 'uuid', nullable: true })
  assignedByUserId: string | null;

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt: Date;

  @ManyToOne(() => StaffProfile, (profile) => profile.roleAssignments, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'staff_user_id', referencedColumnName: 'userId' })
  staffProfile: StaffProfile;

  @ManyToOne(() => Role, (role) => role.staffAssignments, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'assigned_by_user_id' })
  assignedByUser?: User | null;
}
