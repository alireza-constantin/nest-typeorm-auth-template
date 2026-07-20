import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaffProfile } from '../data';
import { AdminAuthorizationGuard } from './admin-authorization.guard';
import { AuthorizationContextService } from './authorization-context.service';

@Module({
  imports: [TypeOrmModule.forFeature([StaffProfile])],
  providers: [AuthorizationContextService, AdminAuthorizationGuard],
  exports: [AuthorizationContextService, AdminAuthorizationGuard],
})
export class AuthorizationEnforcementModule {}
