import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  IDENTITY_ADMINISTRATION,
  type IdentityAdministration,
  type IdentityLockResult,
  type IdentityReference,
} from '../../identity';
import { DatabaseTransactionRunner } from '../../../platform/database';
import {
  AuditActionKey,
  AuthorizationPersistenceService,
  PermissionKey,
  Role,
  RoleKey,
  StaffProfile,
  StaffProfileStatus,
} from '../data';

export interface StaffActor {
  readonly userId: string;
  readonly permissions: readonly PermissionKey[];
}

export interface StaffRequestContext {
  readonly actor: StaffActor;
  readonly requestId: string;
}

export interface StaffProfileResponse {
  readonly userId: string;
  readonly email: string;
  readonly status: StaffProfileStatus;
  readonly roles: readonly string[];
  readonly permissions: readonly PermissionKey[];
}

export interface StaffListResponse {
  readonly data: readonly StaffProfileResponse[];
  readonly nextCursor: string | null;
}

@Injectable()
export class StaffLifecycleService {
  constructor(
    private readonly transactions: DatabaseTransactionRunner,
    private readonly persistence: AuthorizationPersistenceService,
    @Inject(IDENTITY_ADMINISTRATION)
    private readonly identities: IdentityAdministration,
  ) {}

  async me(actor: StaffActor): Promise<StaffProfileResponse> {
    const profile = await this.persistence.findProfileWithRoles(actor.userId);
    if (!profile) throw new NotFoundException('Staff profile was not found');
    const identities = await this.identities.findSummariesByIds([actor.userId]);
    const identity = identities[0];
    if (!identity) {
      throw new ServiceUnavailableException(
        'Staff identity data is unavailable',
      );
    }
    return this.toResponse(profile, identity);
  }

  async list(
    cursor: string | undefined,
    limit: number,
  ): Promise<StaffListResponse> {
    const profiles = await this.persistence.listProfiles(cursor, limit);
    const page = profiles.slice(0, limit);
    const identities = await this.identities.findSummariesByIds(
      page.map(({ userId }) => userId),
    );
    const identityById = new Map(
      identities.map((identity) => [identity.id, identity]),
    );
    const data = page.map((profile) => {
      const identity = identityById.get(profile.userId);
      if (!identity) {
        throw new ServiceUnavailableException(
          'Staff identity data is unavailable',
        );
      }
      return this.toResponse(profile, identity);
    });
    return {
      data,
      nextCursor:
        profiles.length > limit ? (data.at(-1)?.userId ?? null) : null,
    };
  }

  async listRoles(): Promise<
    readonly {
      key: string;
      name: string;
      description: string;
      permissions: readonly PermissionKey[];
    }[]
  > {
    const roles = await this.persistence.listSystemRoles();
    return roles.map((role) => ({
      key: role.key,
      name: role.name,
      description: role.description,
      permissions: this.rolePermissions(role),
    }));
  }

  async create(
    context: StaffRequestContext,
    targetUserId: string,
    requestedRoleKeys: readonly string[],
  ): Promise<StaffProfileResponse> {
    return this.transactions.run(async (transaction) => {
      const target = this.requireActiveIdentity(
        await this.identities.lockActiveById(transaction, targetUserId),
        'User was not found',
      );
      const existing = await this.persistence.findProfileWithRoles(
        targetUserId,
        transaction,
      );
      if (existing) throw new ConflictException('The user is already staff');

      const roles = await this.rolesForKeys(transaction, requestedRoleKeys);
      this.assertActorMayAssign(context.actor, roles);
      const addsOwner = this.includesOwner(roles);
      if (addsOwner) await this.persistence.acquireOwnerLock(transaction);

      const profile = await this.persistence.createProfile(transaction, {
        userId: target.id,
        status: StaffProfileStatus.ACTIVE,
        createdByUserId: context.actor.userId,
      });
      await this.persistence.replaceRoleAssignments(
        transaction,
        target.id,
        roles,
        context.actor.userId,
      );
      await this.identities.incrementAuthenticationVersion(
        transaction,
        target.id,
      );
      await this.persistence.writeAudit(transaction, {
        actorUserId: context.actor.userId,
        action: addsOwner
          ? AuditActionKey.OWNER_ASSIGNED
          : AuditActionKey.STAFF_CREATED,
        targetId: target.id,
        requestId: context.requestId,
        metadata: addsOwner
          ? { roleKey: RoleKey.OWNER }
          : { roleKeys: roles.map((role) => role.key) },
      });
      return this.toResponse(profile, target, roles);
    });
  }

  async replaceRoles(
    context: StaffRequestContext,
    targetUserId: string,
    requestedRoleKeys: readonly string[],
  ): Promise<StaffProfileResponse> {
    return this.transactions.run(async (transaction) => {
      const target = this.requireActiveIdentity(
        await this.identities.lockActiveById(transaction, targetUserId),
        'User was not found',
      );
      const profile = await this.persistence.findProfileWithRoles(
        targetUserId,
        transaction,
        true,
      );
      if (!profile) throw new NotFoundException('Staff profile was not found');
      const roles = await this.rolesForKeys(transaction, requestedRoleKeys);
      this.assertActorMayAssign(context.actor, roles);

      const previousRoles =
        profile.roleAssignments?.map(({ role }) => role) ?? [];
      const ownerChanged =
        this.includesOwner(previousRoles) !== this.includesOwner(roles);
      if (ownerChanged) {
        if (
          !context.actor.permissions.includes(PermissionKey.STAFF_ASSIGN_OWNER)
        ) {
          throw new ForbiddenException(
            'Owner role assignment is not permitted',
          );
        }
        await this.persistence.acquireOwnerLock(transaction);
        if (this.includesOwner(previousRoles) && !this.includesOwner(roles)) {
          await this.assertNotLastActiveOwner(transaction);
        }
      }

      await this.persistence.replaceRoleAssignments(
        transaction,
        targetUserId,
        roles,
        context.actor.userId,
      );
      await this.identities.incrementAuthenticationVersion(
        transaction,
        target.id,
      );
      await this.persistence.writeAudit(transaction, {
        actorUserId: context.actor.userId,
        action:
          ownerChanged && this.includesOwner(previousRoles)
            ? AuditActionKey.OWNER_REMOVED
            : ownerChanged
              ? AuditActionKey.OWNER_ASSIGNED
              : AuditActionKey.STAFF_ROLES_REPLACED,
        targetId: targetUserId,
        requestId: context.requestId,
        metadata: ownerChanged
          ? { roleKey: RoleKey.OWNER }
          : {
              previousRoleKeys: previousRoles.map((role) => role.key),
              newRoleKeys: roles.map((role) => role.key),
            },
      });
      return this.toResponse(profile, target, roles);
    });
  }

  async suspend(
    context: StaffRequestContext,
    targetUserId: string,
  ): Promise<StaffProfileResponse> {
    return this.changeStatus(
      context,
      targetUserId,
      StaffProfileStatus.SUSPENDED,
    );
  }

  async activate(
    context: StaffRequestContext,
    targetUserId: string,
  ): Promise<StaffProfileResponse> {
    return this.changeStatus(context, targetUserId, StaffProfileStatus.ACTIVE);
  }

  private async changeStatus(
    context: StaffRequestContext,
    targetUserId: string,
    nextStatus: StaffProfileStatus,
  ): Promise<StaffProfileResponse> {
    return this.transactions.run(async (transaction) => {
      const target = this.requireActiveIdentity(
        await this.identities.lockActiveById(transaction, targetUserId),
        'User was not found',
      );
      const profile = await this.persistence.findProfileWithRoles(
        targetUserId,
        transaction,
        true,
      );
      if (!profile) throw new NotFoundException('Staff profile was not found');
      if (profile.status === nextStatus) {
        throw new ConflictException(`Staff profile is already ${nextStatus}`);
      }
      const hasOwner = this.includesOwner(
        profile.roleAssignments?.map(({ role }) => role) ?? [],
      );
      if (hasOwner) {
        if (
          !context.actor.permissions.includes(PermissionKey.STAFF_ASSIGN_OWNER)
        ) {
          throw new ForbiddenException(
            'Owner status changes are not permitted',
          );
        }
        await this.persistence.acquireOwnerLock(transaction);
        if (nextStatus === StaffProfileStatus.SUSPENDED) {
          await this.assertNotLastActiveOwner(transaction);
        }
      }

      const previousStatus = profile.status;
      profile.status = nextStatus;
      await this.persistence.saveProfile(transaction, profile);
      await this.identities.incrementAuthenticationVersion(
        transaction,
        target.id,
      );
      await this.persistence.writeAudit(transaction, {
        actorUserId: context.actor.userId,
        action:
          nextStatus === StaffProfileStatus.ACTIVE
            ? AuditActionKey.STAFF_ACTIVATED
            : AuditActionKey.STAFF_SUSPENDED,
        targetId: targetUserId,
        requestId: context.requestId,
        metadata: { previousStatus },
      });
      return this.toResponse(profile, target);
    });
  }

  private async rolesForKeys(
    transaction: Parameters<IdentityAdministration['lockActiveById']>[0],
    roleKeys: readonly string[],
  ): Promise<Role[]> {
    const uniqueKeys = [...new Set(roleKeys)];
    const roles = await this.persistence.findSystemRolesByKeys(
      transaction,
      uniqueKeys,
    );
    if (roles.length !== uniqueKeys.length) {
      throw new NotFoundException('One or more requested roles were not found');
    }
    return roles;
  }

  private assertActorMayAssign(
    actor: StaffActor,
    roles: readonly Role[],
  ): void {
    const actorPermissions = new Set(actor.permissions);
    const requestedPermissions = new Set(
      roles.flatMap((role) => this.rolePermissions(role)),
    );
    if (
      this.includesOwner(roles) &&
      !actorPermissions.has(PermissionKey.STAFF_ASSIGN_OWNER)
    ) {
      throw new ForbiddenException('Owner role assignment is not permitted');
    }
    if (
      [...requestedPermissions].some(
        (permission) => !actorPermissions.has(permission),
      )
    ) {
      throw new ForbiddenException(
        'Role assignment would exceed the actor authority',
      );
    }
  }

  private async assertNotLastActiveOwner(
    transaction: Parameters<IdentityAdministration['lockActiveById']>[0],
  ): Promise<void> {
    const ownerUserIds =
      await this.persistence.findActiveOwnerUserIds(transaction);
    const activeOwnerUserIds = await this.identities.findActiveIdsByIds(
      transaction,
      ownerUserIds,
    );
    if (activeOwnerUserIds.length <= 1) {
      throw new ConflictException('The last active owner cannot be changed');
    }
  }

  private requireActiveIdentity(
    result: IdentityLockResult,
    notFoundMessage: string,
  ): IdentityReference {
    if (result.outcome === 'active') return result.identity;
    if (result.outcome === 'not_found') {
      throw new NotFoundException(notFoundMessage);
    }
    if (result.outcome === 'disabled') {
      throw new ConflictException('Disabled users cannot receive staff access');
    }
    throw new ConflictException('Identity lookup is ambiguous');
  }

  private includesOwner(roles: readonly Role[]): boolean {
    return roles.some((role) => role.key === RoleKey.OWNER);
  }

  private rolePermissions(role: Role): PermissionKey[] {
    return (role.rolePermissions ?? []).map(
      ({ permissionKey }) => permissionKey as PermissionKey,
    );
  }

  private toResponse(
    profile: StaffProfile,
    identity: IdentityReference,
    explicitRoles?: readonly Role[],
  ): StaffProfileResponse {
    const roles =
      explicitRoles ?? (profile.roleAssignments ?? []).map(({ role }) => role);
    return {
      userId: profile.userId,
      email: identity.email,
      status: profile.status,
      roles: roles.map((role) => role.key).sort(),
      permissions: [
        ...new Set(roles.flatMap((role) => this.rolePermissions(role))),
      ].sort(),
    };
  }
}
