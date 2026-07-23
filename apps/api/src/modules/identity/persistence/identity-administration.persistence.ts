import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type {
  IdentityAdministration,
  IdentityLockResult,
  IdentityReference,
  IdentitySummary,
} from '../identity-administration.contract';
import { User, UserStatus } from './user.entity';
import type { DatabaseTransactionContext } from '../../../platform/database';
import { unwrapTypeOrmTransaction } from '../../../platform/database/typeorm-transaction-context';

@Injectable()
export class IdentityAdministrationPersistence implements IdentityAdministration {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async findActiveById(userId: string): Promise<IdentityReference | null> {
    const user = await this.users.findOne({ where: { id: userId } });
    return user?.status === UserStatus.ACTIVE ? this.toReference(user) : null;
  }

  async findActiveByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<IdentityReference | null> {
    const user = await this.users.findOne({
      where: { emailNormalized: normalizedEmail },
    });
    return user?.status === UserStatus.ACTIVE ? this.toReference(user) : null;
  }

  async findSummariesByIds(
    userIds: readonly string[],
  ): Promise<IdentitySummary[]> {
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length === 0) return [];

    const users = await this.users.find({ where: { id: In(uniqueIds) } });
    return users.map((user) => this.toReference(user));
  }

  async lockActiveById(
    transaction: DatabaseTransactionContext,
    userId: string,
  ): Promise<IdentityLockResult> {
    const manager = unwrapTypeOrmTransaction(transaction);
    const user = await manager.getRepository(User).findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    return this.toLockResult(user);
  }

  async lockActiveByNormalizedEmail(
    transaction: DatabaseTransactionContext,
    normalizedEmail: string,
  ): Promise<IdentityLockResult> {
    const manager = unwrapTypeOrmTransaction(transaction);
    const users = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .where('user.emailNormalized = :normalizedEmail', { normalizedEmail })
      .setLock('pessimistic_write')
      .getMany();
    if (users.length === 0) return { outcome: 'not_found' };
    if (users.length !== 1) return { outcome: 'ambiguous' };
    return this.toLockResult(users[0]);
  }

  async findActiveIdsByIds(
    transaction: DatabaseTransactionContext,
    userIds: readonly string[],
  ): Promise<readonly string[]> {
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length === 0) return [];

    const users = await unwrapTypeOrmTransaction(transaction)
      .getRepository(User)
      .find({
        select: { id: true },
        where: { id: In(uniqueIds), status: UserStatus.ACTIVE },
      });
    return users.map(({ id }) => id);
  }

  async incrementAuthenticationVersion(
    transaction: DatabaseTransactionContext,
    userId: string,
  ): Promise<void> {
    const result = await unwrapTypeOrmTransaction(transaction)
      .getRepository(User)
      .increment({ id: userId }, 'authVersion', 1);
    if (result.affected !== 1) {
      throw new Error('Identity disappeared during authorization transaction');
    }
  }

  private toLockResult(user: User | null): IdentityLockResult {
    if (!user) return { outcome: 'not_found' };
    if (user.status !== UserStatus.ACTIVE) return { outcome: 'disabled' };
    return { outcome: 'active', identity: this.toReference(user) };
  }

  private toReference(user: User): IdentityReference {
    return { id: user.id, email: user.email };
  }
}
