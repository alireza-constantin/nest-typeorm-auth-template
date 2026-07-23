import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../../../platform/observability';
import { IdentityModule } from '../../identity';
import { AuthorizationDataModule } from '../data';
import { OwnerBootstrapService } from './owner-bootstrap.service';

@Module({
  imports: [AuthorizationDataModule, IdentityModule, ObservabilityModule],
  providers: [OwnerBootstrapService],
  exports: [OwnerBootstrapService],
})
export class BootstrapModule {}
