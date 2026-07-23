import { DataSourceOptions } from 'typeorm';
import { ApplicationConfiguration } from '../config';

export const createDatabaseOptions = (
  config: ApplicationConfiguration,
): DataSourceOptions => ({
  type: 'postgres',
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.name,
  applicationName: 'better-commerce',
  // Development databases are disposable for now. Production deliberately
  // keeps synchronization disabled and must regain migrations before launch.
  synchronize: config.environment !== 'production',
  ssl:
    config.database.sslMode === 'disable'
      ? false
      : {
          rejectUnauthorized: config.database.sslMode === 'verify-full',
        },
  extra: {
    max: config.database.poolMax,
    connectionTimeoutMillis: config.database.connectionTimeoutMs,
    statement_timeout: config.database.statementTimeoutMs,
  },
});
