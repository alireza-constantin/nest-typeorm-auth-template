import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../../platform/observability';
import { AuthorizationDataModule } from '../data';
import { StaffAdminController } from './staff-admin.controller';
import { StaffLifecycleService } from './staff-lifecycle.service';

@Module({
  imports: [AuthorizationDataModule, ObservabilityModule],
  controllers: [StaffAdminController],
  providers: [StaffLifecycleService],
  exports: [StaffLifecycleService],
})
export class StaffModule {}
