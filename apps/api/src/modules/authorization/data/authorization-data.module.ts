import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthorizationAuditEvent } from './authorization-audit-event.entity';
import { AuthorizationCatalogueSyncService } from './authorization-catalogue-sync.service';
import { AuthorizationPersistenceService } from './authorization-persistence.service';
import { Permission } from './permission.entity';
import { RolePermission } from './role-permission.entity';
import { Role } from './role.entity';
import { StaffProfile } from './staff-profile.entity';
import { StaffRoleAssignment } from './staff-role-assignment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StaffProfile,
      Permission,
      Role,
      RolePermission,
      StaffRoleAssignment,
      AuthorizationAuditEvent,
    ]),
  ],
  providers: [
    AuthorizationCatalogueSyncService,
    AuthorizationPersistenceService,
  ],
  exports: [
    TypeOrmModule,
    AuthorizationCatalogueSyncService,
    AuthorizationPersistenceService,
  ],
})
export class AuthorizationDataModule {}
