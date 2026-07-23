import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  createTypeOrmTransactionContext,
  type DatabaseTransactionContext,
} from './typeorm-transaction-context';

export type { DatabaseTransactionContext };

/**
 * Opens the shared PostgreSQL transaction needed by a named cross-module use
 * case. Application code receives only an opaque context; it cannot access
 * TypeORM repositories, entities, or the EntityManager.
 */
@Injectable()
export class DatabaseTransactionRunner {
  constructor(private readonly dataSource: DataSource) {}

  run<T>(
    work: (transaction: DatabaseTransactionContext) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction((manager) =>
      work(createTypeOrmTransactionContext(manager)),
    );
  }
}
