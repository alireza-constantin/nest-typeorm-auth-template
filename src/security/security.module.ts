import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from '../redis';
import { AbuseProtectionService } from './abuse-protection.service';
import { CsrfController } from './csrf.controller';
import { CsrfProtectionMiddleware } from './csrf-protection.middleware';
import { CsrfService } from './csrf.service';
import { SECURITY_CONFIGURATION } from './security.constants';
import { buildSecurityConfiguration } from './security.config';
import { TrustedOriginService } from './trusted-origin.service';

@Module({
  imports: [ConfigModule, RedisModule],
  controllers: [CsrfController],
  providers: [
    {
      provide: SECURITY_CONFIGURATION,
      inject: [ConfigService],
      useFactory: buildSecurityConfiguration,
    },
    CsrfService,
    TrustedOriginService,
    CsrfProtectionMiddleware,
    AbuseProtectionService,
  ],
  exports: [
    SECURITY_CONFIGURATION,
    CsrfService,
    TrustedOriginService,
    CsrfProtectionMiddleware,
    AbuseProtectionService,
  ],
})
export class SecurityModule {}
