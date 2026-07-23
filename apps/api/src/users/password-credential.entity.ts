import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'password_credentials' })
export class PasswordCredential {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** Explicit selection is required whenever a password needs verification. */
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;

  @Column({ name: 'password_changed_at', type: 'timestamptz' })
  passwordChangedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => User, (user) => user.passwordCredential, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
