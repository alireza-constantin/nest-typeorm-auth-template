import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'email_verification_tokens' })
@Index('IDX_email_verification_tokens_user_created', ['userId', 'createdAt'])
@Index('IDX_email_verification_tokens_expires_at', ['expiresAt'])
export class EmailVerificationToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** SHA-256/HMAC digest only. The bearer token must never be persisted. */
  @Index('UQ_email_verification_tokens_token_hash', { unique: true })
  @Column({
    name: 'token_hash',
    type: 'char',
    length: 64,
    select: false,
  })
  tokenHash: string;

  /** Binds the token to the address that was current when it was issued. */
  @Column({ name: 'email_normalized', type: 'varchar', length: 320 })
  emailNormalized: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.emailVerificationTokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
