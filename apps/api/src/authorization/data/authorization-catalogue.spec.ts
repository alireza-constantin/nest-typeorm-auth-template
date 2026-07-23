import {
  BUILT_IN_ROLE_CATALOGUE,
  PERMISSION_CATALOGUE,
  PermissionKey,
  RoleKey,
} from './authorization-catalogue';

describe('authorization catalogue', () => {
  it('contains unique explicit permission keys', () => {
    const keys = PERMISSION_CATALOGUE.map(({ key }) => key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(25);
  });

  it('contains unique built-in roles with explicit, known permissions', () => {
    const roleKeys = BUILT_IN_ROLE_CATALOGUE.map(({ key }) => key);
    const knownPermissions = new Set(
      PERMISSION_CATALOGUE.map(({ key }) => key),
    );

    expect(new Set(roleKeys).size).toBe(roleKeys.length);
    for (const role of BUILT_IN_ROLE_CATALOGUE) {
      expect(role.permissionKeys).not.toHaveLength(0);
      expect(new Set(role.permissionKeys).size).toBe(
        role.permissionKeys.length,
      );
      expect(
        role.permissionKeys.every((key) => knownPermissions.has(key)),
      ).toBe(true);
    }
  });

  it('gives owner every current permission and keeps owner assignment owner-only', () => {
    const owner = BUILT_IN_ROLE_CATALOGUE.find(
      (role) => role.key === RoleKey.OWNER,
    );
    const administrator = BUILT_IN_ROLE_CATALOGUE.find(
      (role) => role.key === RoleKey.ADMINISTRATOR,
    );

    expect(owner?.permissionKeys).toEqual(
      expect.arrayContaining(PERMISSION_CATALOGUE.map(({ key }) => key)),
    );
    expect(owner?.permissionKeys).toHaveLength(PERMISSION_CATALOGUE.length);
    expect(administrator?.permissionKeys).not.toContain(
      PermissionKey.STAFF_ASSIGN_OWNER,
    );
  });
});
