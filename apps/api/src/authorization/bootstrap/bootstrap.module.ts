import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../../platform/observability';
import { AuthorizationDataModule } from '../data';
import { OwnerBootstrapService } from './owner-bootstrap.service';

@Module({
  imports: [AuthorizationDataModule, ObservabilityModule],
  providers: [OwnerBootstrapService],
  exports: [OwnerBootstrapService],
})
export class BootstrapModule {}
