export { AuthorizationModule } from './authorization.module';
export { AdminApi } from './enforcement/admin-api.decorator';
export { AdminAuthorizationGuard } from './enforcement/admin-authorization.guard';
export {
  RequirePermissions,
  type PermissionRequirementOptions,
} from './enforcement/require-permissions.decorator';
export type {
  AuthorizationContext,
  PermissionCheckMode,
  PermissionRequirement,
} from './enforcement/authorization-context';
export { PermissionKey } from './data/authorization-catalogue';
