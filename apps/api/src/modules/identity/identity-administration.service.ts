import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type {
  IdentityAdministration,
  IdentityReference,
  IdentitySummary,
} from './identity-administration.contract';
import { User, UserStatus } from './persistence/user.entity';

@Injectable()
export class IdentityAdministrationService implements IdentityAdministration {
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

  private toReference(user: User): IdentityReference {
    return { id: user.id, email: user.email };
  }
}
