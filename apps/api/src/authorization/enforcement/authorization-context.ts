import { StaffProfileStatus } from '../data/staff-profile.entity';
import type { PermissionKey } from '../data/authorization-catalogue';

export type PermissionCheckMode = 'all' | 'any';

export interface PermissionRequirement {
  readonly permissions: readonly PermissionKey[];
  readonly mode: PermissionCheckMode;
}

/**
 * Server-derived authorization facts for the current administrative request.
 * This object is never built from session or client-supplied role data.
 */
export interface AuthorizationContext {
  readonly userId: string;
  readonly staffStatus: StaffProfileStatus.ACTIVE;
  readonly roleKeys: readonly string[];
  readonly permissions: readonly PermissionKey[];
}

export type AuthorizationContextLoadResult =
  | {
      readonly outcome: 'active';
      readonly context: AuthorizationContext;
    }
  | {
      readonly outcome: 'not_staff' | 'suspended' | 'no_roles';
    };
