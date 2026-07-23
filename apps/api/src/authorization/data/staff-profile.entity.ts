import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './identity-user.persistence';
import { StaffRoleAssignment } from './staff-role-assignment.entity';

export enum StaffProfileStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

/**
 * Administrative access is an optional capability of a user, never a
 * replacement for their customer identity.
 */
@Entity({ name: 'staff_profiles' })
@Index('IDX_staff_profiles_status', ['status'])
export class StaffProfile {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: StaffProfileStatus,
    enumName: 'staff_profile_status',
    default: StaffProfileStatus.ACTIVE,
  })
  status: StaffProfileStatus;

  /** Null is reserved for the out-of-band first-owner bootstrap. */
  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser?: User | null;

  @OneToMany(() => StaffRoleAssignment, (assignment) => assignment.staffProfile)
  roleAssignments?: StaffRoleAssignment[];
}
