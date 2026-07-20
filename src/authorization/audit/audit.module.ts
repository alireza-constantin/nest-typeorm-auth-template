import { Module } from '@nestjs/common';
import { AuthorizationDataModule } from '../data';
import { AuditEventsController } from './audit-events.controller';
import { AuditEventsService } from './audit-events.service';

@Module({
  imports: [AuthorizationDataModule],
  controllers: [AuditEventsController],
  providers: [AuditEventsService],
  exports: [AuditEventsService],
})
export class AuditModule {}
