import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { EmailVerificationController } from './auth/email-verification.controller';
import { EmailVerificationService } from './auth/email-verification.service';
import { PasswordService } from './auth/password.service';
import { SessionAuthGuard } from './auth/session-auth.guard';
import { IDENTITY_ADMINISTRATION } from './identity-administration.contract';
import { IdentityAdministrationService } from './identity-administration.service';
import { EmailVerificationToken } from './persistence/email-verification-token.entity';
import { PasswordCredential } from './persistence/password-credential.entity';
import { User } from './persistence/user.entity';
import { SessionModule } from './session';
import { SecurityModule } from '../../platform/security';

@Module({
  imports: [
    ConfigModule,
    SessionModule,
    SecurityModule,
    TypeOrmModule.forFeature([
      User,
      PasswordCredential,
      EmailVerificationToken,
    ]),
  ],
  controllers: [AuthController, EmailVerificationController],
  providers: [
    AuthService,
    PasswordService,
    SessionAuthGuard,
    EmailVerificationService,
    IdentityAdministrationService,
    {
      provide: IDENTITY_ADMINISTRATION,
      useExisting: IdentityAdministrationService,
    },
  ],
  exports: [SessionAuthGuard, IDENTITY_ADMINISTRATION],
})
export class IdentityModule {}
