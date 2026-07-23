import { Injectable } from '@nestjs/common';
import { DataSource, In, type EntityManager } from 'typeorm';
import type { DatabaseTransactionContext } from '../../../platform/database';
import { unwrapTypeOrmTransaction } from '../../../platform/database/typeorm-transaction-context';
import { AuditActionKey, type SafeAuditMetadata } from './audit-catalogue';
import { AuthorizationAuditEvent } from './authorization-audit-event.entity';
import { RoleKey } from './authorization-catalogue';
import { Role } from './role.entity';
import { StaffProfile, StaffProfileStatus } from './staff-profile.entity';
import { StaffRoleAssignment } from './staff-role-assignment.entity';

const OWNER_LOCK_SQL =
  "SELECT pg_advisory_xact_lock(hashtext('better-commerce:authorization-owner-role'))";

@Injectable()
export class AuthorizationPersistenceService {
  constructor(private readonly dataSource: DataSource) {}

  async listProfiles(
    cursor: string | undefined,
    limit: number,
  ): Promise<StaffProfile[]> {
    return this.profileQuery(this.dataSource.manager)
      .where(cursor ? 'profile.userId > :cursor' : '1 = 1', { cursor })
      .orderBy('profile.userId', 'ASC')
      .take(limit + 1)
      .getMany();
  }

  async findProfileWithRoles(
    userId: string,
    transaction?: DatabaseTransactionContext,
    lock = false,
  ): Promise<StaffProfile | null> {
    const query = this.profileQuery(this.manager(transaction)).where(
      'profile.userId = :userId',
      { userId },
    );
    // Lock only Authorization's authoritative profile row. PostgreSQL rejects
    // an unqualified FOR UPDATE when nullable LEFT JOINs are present.
    if (lock) query.setLock('pessimistic_write', undefined, ['profile']);
    return query.getOne();
  }

  async listSystemRoles(): Promise<Role[]> {
    return this.dataSource.getRepository(Role).find({
      where: { systemManaged: true },
      relations: { rolePermissions: { permission: true } },
      order: { key: 'ASC' },
    });
  }

  async findSystemRolesByKeys(
    transaction: DatabaseTransactionContext,
    roleKeys: readonly string[],
  ): Promise<Role[]> {
    const uniqueKeys = [...new Set(roleKeys)];
    if (uniqueKeys.length === 0) return [];
    return this.manager(transaction)
      .getRepository(Role)
      .find({
        where: { key: In(uniqueKeys), systemManaged: true },
        relations: { rolePermissions: { permission: true } },
      });
  }

  async findOwnerRole(
    transaction: DatabaseTransactionContext,
  ): Promise<Role | null> {
    return this.manager(transaction)
      .getRepository(Role)
      .findOne({
        where: { key: RoleKey.OWNER, systemManaged: true },
      });
  }

  async createProfile(
    transaction: DatabaseTransactionContext,
    input: {
      userId: string;
      status: StaffProfileStatus;
      createdByUserId: string | null;
    },
  ): Promise<StaffProfile> {
    const profiles = this.manager(transaction).getRepository(StaffProfile);
    return profiles.save(profiles.create(input));
  }

  async saveProfile(
    transaction: DatabaseTransactionContext,
    profile: StaffProfile,
  ): Promise<StaffProfile> {
    return this.manager(transaction).getRepository(StaffProfile).save(profile);
  }

  async replaceRoleAssignments(
    transaction: DatabaseTransactionContext,
    staffUserId: string,
    roles: readonly Role[],
    assignedByUserId: string | null,
  ): Promise<void> {
    const assignments =
      this.manager(transaction).getRepository(StaffRoleAssignment);
    await assignments.delete({ staffUserId });
    if (roles.length === 0) return;
    await assignments.save(
      roles.map((role) =>
        assignments.create({
          staffUserId,
          roleId: role.id,
          assignedByUserId,
        }),
      ),
    );
  }

  async addRoleAssignmentIfMissing(
    transaction: DatabaseTransactionContext,
    staffUserId: string,
    roleId: string,
    assignedByUserId: string | null,
  ): Promise<void> {
    const assignments =
      this.manager(transaction).getRepository(StaffRoleAssignment);
    const existing = await assignments.findOne({
      where: { staffUserId, roleId },
    });
    if (existing) return;
    await assignments.save(
      assignments.create({ staffUserId, roleId, assignedByUserId }),
    );
  }

  async acquireOwnerLock(
    transaction: DatabaseTransactionContext,
  ): Promise<void> {
    await this.manager(transaction).query(OWNER_LOCK_SQL);
  }

  async findActiveOwnerUserIds(
    transaction: DatabaseTransactionContext,
  ): Promise<readonly string[]> {
    const rows = await this.manager(transaction)
      .getRepository(StaffProfile)
      .createQueryBuilder('profile')
      .select('profile.userId', 'userId')
      .innerJoin('profile.roleAssignments', 'assignment')
      .innerJoin('assignment.role', 'role', 'role.key = :ownerKey', {
        ownerKey: RoleKey.OWNER,
      })
      .where('profile.status = :status', {
        status: StaffProfileStatus.ACTIVE,
      })
      .distinct(true)
      .getRawMany<{ userId: string }>();
    return rows.map(({ userId }) => userId);
  }

  async writeAudit(
    transaction: DatabaseTransactionContext,
    input: {
      actorUserId: string | null;
      action: (typeof AuditActionKey)[keyof typeof AuditActionKey];
      targetId: string;
      requestId: string | null;
      metadata: SafeAuditMetadata;
    },
  ): Promise<void> {
    const audits = this.manager(transaction).getRepository(
      AuthorizationAuditEvent,
    );
    await audits.save(
      audits.create({
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: 'staff_user',
        targetId: input.targetId,
        requestId: input.requestId,
        metadata: input.metadata,
      }),
    );
  }

  private manager(
    transaction: DatabaseTransactionContext | undefined,
  ): EntityManager {
    return transaction
      ? unwrapTypeOrmTransaction(transaction)
      : this.dataSource.manager;
  }

  private profileQuery(manager: EntityManager) {
    return manager
      .getRepository(StaffProfile)
      .createQueryBuilder('profile')
      .leftJoinAndSelect('profile.roleAssignments', 'assignment')
      .leftJoinAndSelect('assignment.role', 'role')
      .leftJoinAndSelect('role.rolePermissions', 'rolePermission')
      .leftJoinAndSelect('rolePermission.permission', 'permission');
  }
}
