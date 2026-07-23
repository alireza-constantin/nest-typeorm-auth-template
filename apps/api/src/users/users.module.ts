import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { PasswordCredential } from './password-credential.entity';
import { EmailVerificationToken } from './email-verification-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      PasswordCredential,
      EmailVerificationToken,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class UsersModule {}
