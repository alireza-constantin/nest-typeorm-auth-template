import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IDENTITY_ADMINISTRATION,
  type IdentityAdministration,
  type IdentityLockResult,
  type IdentityReference,
} from '../../identity';
import { DatabaseTransactionRunner } from '../../../platform/database';
import { SecurityEventLoggerService } from '../../../platform/observability';
import {
  AuditActionKey,
  AuthorizationPersistenceService,
  RoleKey,
  StaffProfileStatus,
} from '../data';

export interface OwnerBootstrapResult {
  readonly userId: string;
  readonly changed: boolean;
}

/**
 * Deployment-only orchestrator for establishing the first owner from an
 * existing Identity account. It intentionally has no HTTP controller and
 * accepts no password material.
 */
@Injectable()
export class OwnerBootstrapService {
  constructor(
    private readonly transactions: DatabaseTransactionRunner,
    private readonly persistence: AuthorizationPersistenceService,
    @Inject(IDENTITY_ADMINISTRATION)
    private readonly identities: IdentityAdministration,
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
      return await this.transactions.run(async (transaction) => {
        await this.persistence.acquireOwnerLock(transaction);
        const user = this.requireBootstrapIdentity(
          await this.identities.lockActiveByNormalizedEmail(
            transaction,
            emailNormalized,
          ),
        );

        const owner = await this.persistence.findOwnerRole(transaction);
        if (!owner) {
          throw new ConflictException(
            'The owner role catalogue is unavailable',
          );
        }

        const profile = await this.persistence.findProfileWithRoles(
          user.id,
          transaction,
          true,
        );
        const alreadyOwner =
          profile?.status === StaffProfileStatus.ACTIVE &&
          (profile.roleAssignments ?? []).some(
            (assignment) => assignment.role.key === RoleKey.OWNER,
          );
        if (alreadyOwner) return { userId: user.id, changed: false };

        if (profile) {
          profile.status = StaffProfileStatus.ACTIVE;
          await this.persistence.saveProfile(transaction, profile);
        } else {
          await this.persistence.createProfile(transaction, {
            userId: user.id,
            status: StaffProfileStatus.ACTIVE,
            createdByUserId: null,
          });
        }

        await this.persistence.addRoleAssignmentIfMissing(
          transaction,
          user.id,
          owner.id,
          null,
        );
        await this.identities.incrementAuthenticationVersion(
          transaction,
          user.id,
        );
        await this.persistence.writeAudit(transaction, {
          actorUserId: null,
          action: AuditActionKey.OWNER_BOOTSTRAPPED,
          targetId: user.id,
          requestId: null,
          metadata: { roleKey: RoleKey.OWNER },
        });
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

  private requireBootstrapIdentity(
    result: IdentityLockResult,
  ): IdentityReference {
    if (result.outcome === 'active') return result.identity;
    if (result.outcome === 'not_found') {
      throw new NotFoundException('Bootstrap target was not found');
    }
    if (result.outcome === 'ambiguous') {
      throw new ConflictException('Bootstrap target is ambiguous');
    }
    throw new ConflictException('Disabled users cannot receive owner access');
  }
}
