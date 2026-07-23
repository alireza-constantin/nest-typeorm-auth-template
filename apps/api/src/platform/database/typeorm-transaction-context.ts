import type { EntityManager } from 'typeorm';

const transactionContextBrand: unique symbol = Symbol(
  'database-transaction-context',
);

/**
 * Application-visible transaction capability. The TypeORM manager is held in
 * module-private infrastructure state and is never present on this object.
 */
export interface DatabaseTransactionContext {
  readonly [transactionContextBrand]: true;
}

const managers = new WeakMap<DatabaseTransactionContext, EntityManager>();

export function createTypeOrmTransactionContext(
  manager: EntityManager,
): DatabaseTransactionContext {
  const context = Object.freeze({
    [transactionContextBrand]: true as const,
  });
  managers.set(context, manager);
  return context;
}

/**
 * Infrastructure-only escape hatch for persistence adapters participating in
 * a transaction opened by DatabaseTransactionRunner.
 */
export function unwrapTypeOrmTransaction(
  transaction: DatabaseTransactionContext,
): EntityManager {
  const manager = managers.get(transaction);
  if (!manager) throw new Error('Invalid database transaction context');
  return manager;
}
