import type { DatabaseTransactionContext } from '../../platform/database';

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

export type IdentityLockResult =
  | { readonly outcome: 'active'; readonly identity: IdentityReference }
  | { readonly outcome: 'not_found' }
  | { readonly outcome: 'disabled' }
  | { readonly outcome: 'ambiguous' };

/**
 * Identity's narrow administration/query boundary. Transaction-aware methods
 * accept an opaque platform capability; callers cannot reach TypeORM state.
 */
export interface IdentityAdministration {
  findActiveById(userId: string): Promise<IdentityReference | null>;
  findActiveByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<IdentityReference | null>;
  findSummariesByIds(userIds: readonly string[]): Promise<IdentitySummary[]>;
  lockActiveById(
    transaction: DatabaseTransactionContext,
    userId: string,
  ): Promise<IdentityLockResult>;
  lockActiveByNormalizedEmail(
    transaction: DatabaseTransactionContext,
    normalizedEmail: string,
  ): Promise<IdentityLockResult>;
  findActiveIdsByIds(
    transaction: DatabaseTransactionContext,
    userIds: readonly string[],
  ): Promise<readonly string[]>;
  incrementAuthenticationVersion(
    transaction: DatabaseTransactionContext,
    userId: string,
  ): Promise<void>;
}

export const IDENTITY_ADMINISTRATION = Symbol('IDENTITY_ADMINISTRATION');
