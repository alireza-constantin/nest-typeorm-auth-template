import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IdentityUserForeignKey } from './identity-user-foreign-key.persistence';
import { AuditActionKey } from './audit-catalogue';
import type { SafeAuditMetadata } from './audit-catalogue';

/** Insert-only history of successful administrative mutations. */
@Entity({ name: 'authorization_audit_events' })
@Check(
  'CHK_authorization_audit_events_metadata_object',
  "jsonb_typeof(metadata) = 'object'",
)
@Index('IDX_authorization_audit_events_created_at', ['createdAt'])
@Index('IDX_authorization_audit_events_actor_created_at', [
  'actorUserId',
  'createdAt',
])
@Index('IDX_authorization_audit_events_action_created_at', [
  'action',
  'createdAt',
])
@Index('IDX_authorization_audit_events_target', ['targetType', 'targetId'])
export class AuthorizationAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Null represents an out-of-band bootstrap or other system action. */
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ type: 'varchar', length: 100 })
  action: AuditActionKey;

  @Column({ name: 'target_type', type: 'varchar', length: 100 })
  targetType: string;

  @Column({ name: 'target_id', type: 'varchar', length: 255 })
  targetId: string;

  /** Required for HTTP actions; bootstrap/system actions have no request. */
  @Column({ name: 'request_id', type: 'varchar', length: 128, nullable: true })
  requestId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: SafeAuditMetadata;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => IdentityUserForeignKey, {
    cascade: false,
    eager: false,
    lazy: false,
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'actor_user_id' })
  private readonly actorIdentityUserForeignKey?: IdentityUserForeignKey | null;
}
