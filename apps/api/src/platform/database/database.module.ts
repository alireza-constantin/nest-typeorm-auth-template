import { Global, Module } from '@nestjs/common';
import { DatabaseTransactionRunner } from './database-transaction';

@Global()
@Module({
  providers: [DatabaseTransactionRunner],
  exports: [DatabaseTransactionRunner],
})
export class DatabaseModule {}
