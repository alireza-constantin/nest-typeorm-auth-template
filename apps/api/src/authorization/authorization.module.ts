import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from './audit';
import { BootstrapModule } from './bootstrap';
import { AuthorizationDataModule } from './data';
import { AuthorizationEnforcementModule } from './enforcement';
import { StaffModule } from './staff';
import { AuthorizationStartupService } from './authorization-startup.service';

@Module({
  imports: [
    ConfigModule,
    AuthorizationDataModule,
    AuthorizationEnforcementModule,
    StaffModule,
    AuditModule,
    BootstrapModule,
  ],
  providers: [AuthorizationStartupService],
  exports: [AuthorizationEnforcementModule, BootstrapModule],
})
export class AuthorizationModule {}
