import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  AuditActionKey,
  AuthorizationAuditEvent,
  PermissionKey,
  Role,
  RoleKey,
  StaffProfile,
  StaffProfileStatus,
  StaffRoleAssignment,
  type SafeAuditMetadata,
} from '../data';
import { User, UserStatus } from '../data/identity-user.persistence';

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

const OWNER_LOCK_SQL =
  "SELECT pg_advisory_xact_lock(hashtext('better-commerce:authorization-owner-role'))";

@Injectable()
export class StaffLifecycleService {
  constructor(private readonly dataSource: DataSource) {}

  async me(actor: StaffActor): Promise<StaffProfileResponse> {
    const profile = await this.profileWithRoles(
      this.dataSource.manager,
      actor.userId,
    );
    if (!profile) throw new NotFoundException('Staff profile was not found');
    return this.toResponse(profile);
  }

  async list(
    cursor: string | undefined,
    limit: number,
  ): Promise<StaffListResponse> {
    const profiles = await this.dataSource
      .getRepository(StaffProfile)
      .createQueryBuilder('profile')
      .leftJoinAndSelect('profile.user', 'user')
      .leftJoinAndSelect('profile.roleAssignments', 'assignment')
      .leftJoinAndSelect('assignment.role', 'role')
      .leftJoinAndSelect('role.rolePermissions', 'rolePermission')
      .leftJoinAndSelect('rolePermission.permission', 'permission')
      .where(cursor ? 'profile.userId > :cursor' : '1 = 1', { cursor })
      .orderBy('profile.userId', 'ASC')
      .take(limit + 1)
      .getMany();

    const hasNext = profiles.length > limit;
    const data = profiles
      .slice(0, limit)
      .map((profile) => this.toResponse(profile));
    return {
      data,
      nextCursor: hasNext ? (data.at(-1)?.userId ?? null) : null,
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
    const roles = await this.dataSource.getRepository(Role).find({
      where: { systemManaged: true },
      relations: { rolePermissions: { permission: true } },
      order: { key: 'ASC' },
    });
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
    return this.dataSource.transaction(async (manager) => {
      const target = await this.lockActiveUser(manager, targetUserId);
      const existing = await manager.getRepository(StaffProfile).findOne({
        where: { userId: targetUserId },
      });
      if (existing) throw new ConflictException('The user is already staff');

      const roles = await this.rolesForKeys(manager, requestedRoleKeys);
      this.assertActorMayAssign(context.actor, roles);
      const addsOwner = this.includesOwner(roles);
      if (addsOwner) await this.acquireOwnerLock(manager);

      const profiles = manager.getRepository(StaffProfile);
      const assignments = manager.getRepository(StaffRoleAssignment);
      const profile = await profiles.save(
        profiles.create({
          userId: target.id,
          status: StaffProfileStatus.ACTIVE,
          createdByUserId: context.actor.userId,
        }),
      );
      await assignments.save(
        roles.map((role) =>
          assignments.create({
            staffUserId: target.id,
            roleId: role.id,
            assignedByUserId: context.actor.userId,
          }),
        ),
      );
      await this.bumpAuthVersion(manager, target);
      await this.writeAudit(manager, {
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
      return this.toResponseFromRoles(profile, target, roles);
    });
  }

  async replaceRoles(
    context: StaffRequestContext,
    targetUserId: string,
    requestedRoleKeys: readonly string[],
  ): Promise<StaffProfileResponse> {
    return this.dataSource.transaction(async (manager) => {
      const target = await this.lockActiveUser(manager, targetUserId);
      const profile = await this.profileWithRoles(manager, targetUserId, true);
      if (!profile) throw new NotFoundException('Staff profile was not found');
      const roles = await this.rolesForKeys(manager, requestedRoleKeys);
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
        await this.acquireOwnerLock(manager);
        if (this.includesOwner(previousRoles) && !this.includesOwner(roles)) {
          await this.assertNotLastActiveOwner(manager);
        }
      }

      const assignments = manager.getRepository(StaffRoleAssignment);
      await assignments.delete({ staffUserId: targetUserId });
      if (roles.length > 0) {
        await assignments.save(
          roles.map((role) =>
            assignments.create({
              staffUserId: targetUserId,
              roleId: role.id,
              assignedByUserId: context.actor.userId,
            }),
          ),
        );
      }
      await this.bumpAuthVersion(manager, target);
      await this.writeAudit(manager, {
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
      return this.toResponseFromRoles(profile, target, roles);
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
    return this.dataSource.transaction(async (manager) => {
      const target = await this.lockActiveUser(manager, targetUserId);
      const profile = await this.profileWithRoles(manager, targetUserId, true);
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
        await this.acquireOwnerLock(manager);
        if (nextStatus === StaffProfileStatus.SUSPENDED) {
          await this.assertNotLastActiveOwner(manager);
        }
      }
      const previousStatus = profile.status;
      profile.status = nextStatus;
      await manager.getRepository(StaffProfile).save(profile);
      await this.bumpAuthVersion(manager, target);
      await this.writeAudit(manager, {
        actorUserId: context.actor.userId,
        action:
          nextStatus === StaffProfileStatus.ACTIVE
            ? AuditActionKey.STAFF_ACTIVATED
            : AuditActionKey.STAFF_SUSPENDED,
        targetId: targetUserId,
        requestId: context.requestId,
        metadata: { previousStatus },
      });
      return this.toResponse(profile);
    });
  }

  private async lockActiveUser(
    manager: EntityManager,
    userId: string,
  ): Promise<User> {
    const user = await manager.getRepository(User).findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) throw new NotFoundException('User was not found');
    if (user.status !== UserStatus.ACTIVE) {
      throw new ConflictException('Disabled users cannot receive staff access');
    }
    return user;
  }

  private async profileWithRoles(
    manager: EntityManager,
    userId: string,
    lock = false,
  ): Promise<StaffProfile | null> {
    const query = manager
      .getRepository(StaffProfile)
      .createQueryBuilder('profile')
      .leftJoinAndSelect('profile.user', 'user')
      .leftJoinAndSelect('profile.roleAssignments', 'assignment')
      .leftJoinAndSelect('assignment.role', 'role')
      .leftJoinAndSelect('role.rolePermissions', 'rolePermission')
      .leftJoinAndSelect('rolePermission.permission', 'permission')
      .where('profile.userId = :userId', { userId });
    // Lock only the authoritative profile row. PostgreSQL rejects an
    // unqualified FOR UPDATE when this query includes nullable LEFT JOINs.
    if (lock) query.setLock('pessimistic_write', undefined, ['profile']);
    return query.getOne();
  }

  private async rolesForKeys(
    manager: EntityManager,
    roleKeys: readonly string[],
  ): Promise<Role[]> {
    const uniqueKeys = [...new Set(roleKeys)];
    const roles = uniqueKeys.length
      ? await manager.getRepository(Role).find({
          where: { key: In(uniqueKeys), systemManaged: true },
          relations: { rolePermissions: { permission: true } },
        })
      : [];
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

  private async acquireOwnerLock(manager: EntityManager): Promise<void> {
    await manager.query(OWNER_LOCK_SQL);
  }

  private async assertNotLastActiveOwner(
    manager: EntityManager,
  ): Promise<void> {
    const count = await manager
      .getRepository(StaffProfile)
      .createQueryBuilder('profile')
      .innerJoin('profile.user', 'user')
      .innerJoin('profile.roleAssignments', 'assignment')
      .innerJoin('assignment.role', 'role', 'role.key = :ownerKey', {
        ownerKey: RoleKey.OWNER,
      })
      .where('profile.status = :status', { status: StaffProfileStatus.ACTIVE })
      .andWhere('user.status = :userStatus', { userStatus: UserStatus.ACTIVE })
      .getCount();
    if (count <= 1) {
      throw new ConflictException('The last active owner cannot be changed');
    }
  }

  private async bumpAuthVersion(
    manager: EntityManager,
    user: User,
  ): Promise<void> {
    user.authVersion += 1;
    await manager.getRepository(User).save(user);
  }

  private async writeAudit(
    manager: EntityManager,
    input: {
      actorUserId: string | null;
      action: (typeof AuditActionKey)[keyof typeof AuditActionKey];
      targetId: string;
      requestId: string | null;
      metadata: SafeAuditMetadata;
    },
  ): Promise<void> {
    const audits = manager.getRepository(AuthorizationAuditEvent);
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

  private includesOwner(roles: readonly Role[]): boolean {
    return roles.some((role) => role.key === RoleKey.OWNER);
  }

  private rolePermissions(role: Role): PermissionKey[] {
    return (role.rolePermissions ?? []).map(
      ({ permissionKey }) => permissionKey as PermissionKey,
    );
  }

  private toResponse(profile: StaffProfile): StaffProfileResponse {
    const roles = (profile.roleAssignments ?? []).map(({ role }) => role);
    return {
      userId: profile.userId,
      email: profile.user.email,
      status: profile.status,
      roles: roles.map((role) => role.key).sort(),
      permissions: [
        ...new Set(roles.flatMap((role) => this.rolePermissions(role))),
      ].sort(),
    };
  }

  private toResponseFromRoles(
    profile: StaffProfile,
    user: User,
    roles: readonly Role[],
  ): StaffProfileResponse {
    return {
      userId: profile.userId,
      email: user.email,
      status: profile.status,
      roles: roles.map((role) => role.key).sort(),
      permissions: [
        ...new Set(roles.flatMap((role) => this.rolePermissions(role))),
      ].sort(),
    };
  }
}
