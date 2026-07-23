import type { DataSource, EntityManager } from 'typeorm';
import { DatabaseTransactionRunner } from './database-transaction';
import { unwrapTypeOrmTransaction } from './typeorm-transaction-context';

describe('DatabaseTransactionRunner', () => {
  it('keeps TypeORM state off the application-visible context', async () => {
    const manager = { query: jest.fn() } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(
        (work: (transactionManager: EntityManager) => Promise<string>) =>
          work(manager),
      ),
    } as unknown as DataSource;
    const runner = new DatabaseTransactionRunner(dataSource);

    await expect(
      runner.run((transaction) => {
        expect('manager' in transaction).toBe(false);
        expect('repository' in transaction).toBe(false);
        expect(unwrapTypeOrmTransaction(transaction)).toBe(manager);
        return Promise.resolve('committed');
      }),
    ).resolves.toBe('committed');
  });

  it('rejects contexts not created by the infrastructure adapter', () => {
    expect(() =>
      unwrapTypeOrmTransaction(
        {} as Parameters<typeof unwrapTypeOrmTransaction>[0],
      ),
    ).toThrow('Invalid database transaction context');
  });
});
