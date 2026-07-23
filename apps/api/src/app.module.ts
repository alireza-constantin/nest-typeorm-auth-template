import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolve } from 'node:path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminAuthorizationGuard, AuthorizationModule } from './authorization';
import { IdentityModule, SessionAuthGuard } from './modules/identity';
import { configuration, validateEnvironment } from './platform/config';
import { buildConfiguration } from './platform/config/configuration';
import { createDatabaseOptions } from './platform/database/database-options';
import { HealthModule } from './platform/health/health.module';
import { ObservabilityModule } from './platform/observability';
import { SecurityModule } from './platform/security';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [
        resolve(__dirname, '../../../.env'),
        resolve(__dirname, '../.env'),
      ],
      load: [configuration],
      validate: validateEnvironment,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        ...createDatabaseOptions(buildConfiguration(process.env)),
        autoLoadEntities: true,
      }),
    }),
    ObservabilityModule,
    AuthorizationModule,
    SecurityModule,
    IdentityModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useExisting: SessionAuthGuard,
    },
    {
      provide: APP_GUARD,
      useExisting: AdminAuthorizationGuard,
    },
  ],
})
export class AppModule {}
