export const AuditActionKey = {
  STAFF_CREATED: 'staff.created',
  STAFF_ACTIVATED: 'staff.activated',
  STAFF_SUSPENDED: 'staff.suspended',
  STAFF_ROLES_REPLACED: 'staff.roles_replaced',
  OWNER_BOOTSTRAPPED: 'owner.bootstrapped',
  OWNER_ASSIGNED: 'owner.assigned',
  OWNER_REMOVED: 'owner.removed',
} as const;

export type AuditActionKey =
  (typeof AuditActionKey)[keyof typeof AuditActionKey];

type AuditPrimitive = string | number | boolean | null;
export type SafeAuditMetadata = Readonly<
  Record<string, AuditPrimitive | readonly AuditPrimitive[]>
>;

/**
 * Audit metadata is deliberately a tiny, action-specific record. In
 * particular it accepts no free-form request body, email, credential, token,
 * cookie, session identifier, or connection string.
 */
export const AUDIT_METADATA_ALLOWLIST: Readonly<
  Record<AuditActionKey, readonly string[]>
> = Object.freeze({
  [AuditActionKey.STAFF_CREATED]: Object.freeze(['roleKeys']),
  [AuditActionKey.STAFF_ACTIVATED]: Object.freeze(['previousStatus']),
  [AuditActionKey.STAFF_SUSPENDED]: Object.freeze(['previousStatus']),
  [AuditActionKey.STAFF_ROLES_REPLACED]: Object.freeze([
    'previousRoleKeys',
    'newRoleKeys',
  ]),
  [AuditActionKey.OWNER_BOOTSTRAPPED]: Object.freeze(['roleKey']),
  [AuditActionKey.OWNER_ASSIGNED]: Object.freeze(['roleKey']),
  [AuditActionKey.OWNER_REMOVED]: Object.freeze(['roleKey']),
});

export const assertSafeAuditMetadata = (
  action: AuditActionKey,
  metadata: SafeAuditMetadata,
): void => {
  if (
    metadata === null ||
    Array.isArray(metadata) ||
    typeof metadata !== 'object'
  ) {
    throw new TypeError('Authorization audit metadata must be a JSON object.');
  }

  const allowedKeys = new Set(AUDIT_METADATA_ALLOWLIST[action]);
  for (const [key, value] of Object.entries(metadata)) {
    if (!allowedKeys.has(key)) {
      throw new TypeError(
        `Audit metadata key is not allowed for ${action}: ${key}`,
      );
    }

    const values = Array.isArray(value) ? value : [value];
    if (values.some((item) => !isAuditPrimitive(item))) {
      throw new TypeError(
        `Audit metadata value is not safe for ${action}: ${key}`,
      );
    }
  }
};

const isAuditPrimitive = (value: unknown): value is AuditPrimitive =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';
