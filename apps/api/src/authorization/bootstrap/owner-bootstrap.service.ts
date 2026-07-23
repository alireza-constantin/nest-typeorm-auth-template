import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  AuditActionKey,
  AuthorizationAuditEvent,
  Role,
  RoleKey,
  StaffProfile,
  StaffProfileStatus,
  StaffRoleAssignment,
} from '../data';
import { User, UserStatus } from '../data/identity-user.persistence';
import { SecurityEventLoggerService } from '../../platform/observability';

const OWNER_LOCK_SQL =
  "SELECT pg_advisory_xact_lock(hashtext('better-commerce:authorization-owner-role'))";

export interface OwnerBootstrapResult {
  readonly userId: string;
  readonly changed: boolean;
}

/**
 * Deployment-only service for establishing the first owner from an account
 * that already exists. It intentionally has no HTTP controller and accepts no
 * password material.
 */
@Injectable()
export class OwnerBootstrapService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly securityEvents: SecurityEventLoggerService,
  ) {}

  async bootstrap(normalizedEmailInput: string): Promise<OwnerBootstrapResult> {
    const emailNormalized = normalizedEmailInput
      .trim()
      .normalize('NFKC')
      .toLowerCase();
    if (!emailNormalized)
      throw new NotFoundException('Bootstrap target was not found');

    try {
      return await this.dataSource.transaction(async (manager) => {
        await manager.query(OWNER_LOCK_SQL);
        const users = await manager
          .getRepository(User)
          .createQueryBuilder('user')
          .where('user.emailNormalized = :emailNormalized', { emailNormalized })
          .setLock('pessimistic_write')
          .getMany();
        if (users.length === 0)
          throw new NotFoundException('Bootstrap target was not found');
        if (users.length !== 1) {
          throw new ConflictException('Bootstrap target is ambiguous');
        }
        const user = users[0];
        if (user.status !== UserStatus.ACTIVE) {
          throw new ConflictException(
            'Disabled users cannot receive owner access',
          );
        }

        const owner = await manager.getRepository(Role).findOne({
          where: { key: RoleKey.OWNER, systemManaged: true },
        });
        if (!owner) {
          throw new ConflictException(
            'The owner role catalogue is unavailable',
          );
        }

        const profile = await manager
          .getRepository(StaffProfile)
          .createQueryBuilder('profile')
          .leftJoinAndSelect('profile.roleAssignments', 'assignment')
          .leftJoinAndSelect('assignment.role', 'role')
          .where('profile.userId = :userId', { userId: user.id })
          .setLock('pessimistic_write', undefined, ['profile'])
          .getOne();
        const alreadyOwner =
          profile?.status === StaffProfileStatus.ACTIVE &&
          (profile.roleAssignments ?? []).some(
            (assignment) => assignment.role.key === RoleKey.OWNER,
          );
        if (alreadyOwner) return { userId: user.id, changed: false };

        const profiles = manager.getRepository(StaffProfile);
        const assignments = manager.getRepository(StaffRoleAssignment);
        if (profile) {
          await profiles.save({
            ...profile,
            status: StaffProfileStatus.ACTIVE,
          });
        } else {
          await profiles.save(
            profiles.create({
              userId: user.id,
              status: StaffProfileStatus.ACTIVE,
              createdByUserId: null,
            }),
          );
        }

        const ownerAssignment = await assignments.findOne({
          where: { staffUserId: user.id, roleId: owner.id },
        });
        if (!ownerAssignment) {
          await assignments.save(
            assignments.create({
              staffUserId: user.id,
              roleId: owner.id,
              assignedByUserId: null,
            }),
          );
        }

        user.authVersion += 1;
        await manager.getRepository(User).save(user);
        await this.writeSystemAudit(manager, user.id);
        return { userId: user.id, changed: true };
      });
    } catch (error) {
      this.securityEvents.record({
        action: 'owner.bootstrap',
        outcome: 'failed',
        reasonCode: 'invalid_target',
      });
      throw error;
    }
  }

  private async writeSystemAudit(
    manager: EntityManager,
    targetId: string,
  ): Promise<void> {
    const audits = manager.getRepository(AuthorizationAuditEvent);
    await audits.save(
      audits.create({
        actorUserId: null,
        action: AuditActionKey.OWNER_BOOTSTRAPPED,
        targetType: 'staff_user',
        targetId,
        requestId: null,
        metadata: { roleKey: RoleKey.OWNER },
      }),
    );
  }
}
