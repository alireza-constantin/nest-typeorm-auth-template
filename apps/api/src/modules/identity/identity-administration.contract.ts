/**
 * Safe Identity facts for the limited administrative and presentation queries
 * that Authorization will require. These values intentionally exclude
 * credentials, verification material, session state, and persistence details.
 */
export interface IdentityReference {
  readonly id: string;
  readonly email: string;
}

export type IdentitySummary = IdentityReference;

/**
 * The Identity Module Public Contract for the initial Authorization handoff.
 * Transaction-aware locked mutations remain deliberately out of this first
 * contract until Agent 3 introduces the required opaque transaction mechanism.
 */
export interface IdentityAdministration {
  findActiveById(userId: string): Promise<IdentityReference | null>;
  findActiveByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<IdentityReference | null>;
  findSummariesByIds(userIds: readonly string[]): Promise<IdentitySummary[]>;
}

export const IDENTITY_ADMINISTRATION = Symbol('IDENTITY_ADMINISTRATION');
