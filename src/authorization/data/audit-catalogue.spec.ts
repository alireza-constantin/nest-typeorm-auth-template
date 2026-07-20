import { assertSafeAuditMetadata, AuditActionKey } from './audit-catalogue';

describe('authorization audit metadata', () => {
  it('accepts only action-specific primitive metadata', () => {
    expect(() =>
      assertSafeAuditMetadata(AuditActionKey.STAFF_ROLES_REPLACED, {
        previousRoleKeys: ['support_agent'],
        newRoleKeys: ['order_manager'],
      }),
    ).not.toThrow();
  });

  it('rejects sensitive or unstructured metadata keys', () => {
    expect(() =>
      assertSafeAuditMetadata(AuditActionKey.STAFF_CREATED, {
        password: 'not-allowed',
      }),
    ).toThrow('not allowed');

    expect(() =>
      assertSafeAuditMetadata(AuditActionKey.STAFF_CREATED, {
        roleKeys: [{ arbitrary: 'object' }],
      } as never),
    ).toThrow('not safe');
  });
});
