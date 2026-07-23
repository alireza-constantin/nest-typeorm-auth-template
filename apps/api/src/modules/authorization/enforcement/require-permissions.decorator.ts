import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '../data/authorization-catalogue';
import { REQUIRED_PERMISSIONS_METADATA } from './authorization.constants';
import {
  PermissionCheckMode,
  PermissionRequirement,
} from './authorization-context';

export interface PermissionRequirementOptions {
  readonly mode: PermissionCheckMode;
  readonly permissions: readonly PermissionKey[];
}

function normalizeRequirement(
  mode: PermissionCheckMode,
  permissions: readonly PermissionKey[],
): PermissionRequirement {
  return Object.freeze({
    mode,
    permissions: Object.freeze([...new Set(permissions)]),
  });
}

/**
 * Requires every listed permission by default. Use the object form with
 * `mode: 'any'` only when the endpoint contract explicitly allows it.
 */
export function RequirePermissions(
  ...permissions: readonly PermissionKey[]
): MethodDecorator;
export function RequirePermissions(
  options: PermissionRequirementOptions,
): MethodDecorator;
export function RequirePermissions(
  first?: PermissionKey | PermissionRequirementOptions,
  ...remaining: readonly PermissionKey[]
): MethodDecorator {
  const requirement =
    first !== undefined && typeof first === 'object'
      ? normalizeRequirement(first.mode, first.permissions)
      : normalizeRequirement(
          'all',
          first === undefined ? [] : [first, ...remaining],
        );

  return SetMetadata(REQUIRED_PERMISSIONS_METADATA, requirement);
}
