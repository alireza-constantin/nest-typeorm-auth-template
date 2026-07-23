import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { PasswordCredential } from '../users/password-credential.entity';
import { EmailVerificationToken } from '../users/email-verification-token.entity';
import { SessionModule } from '../session';
import { SecurityModule } from '../platform/security';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationController } from './email-verification.controller';
import { EmailVerificationService } from './email-verification.service';
import { PasswordService } from './password.service';
import { SessionAuthGuard } from './session-auth.guard';

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
  ],
  exports: [AuthService, SessionAuthGuard, PasswordService],
})
export class AuthModule {}
