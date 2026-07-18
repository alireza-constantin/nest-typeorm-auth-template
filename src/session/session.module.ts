import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import session, { type SessionOptions } from 'express-session';
import { RedisStore } from 'connect-redis';
import type { RedisClientType } from 'redis';
import { REDIS_CLIENT, RedisModule } from '../redis';
import { createAbsoluteSessionExpiryMiddleware } from './absolute-session-expiry.middleware';
import {
  SESSION_ABSOLUTE_EXPIRY_MIDDLEWARE,
  SESSION_CONFIGURATION,
  SESSION_MIDDLEWARE,
} from './session.constants';
import {
  buildSessionConfiguration,
  remainingSessionTtlSeconds,
  type SessionConfiguration,
} from './session.config';
import { SessionService } from './session.service';

@Module({
  imports: [ConfigModule, RedisModule],
  providers: [
    {
      provide: SESSION_CONFIGURATION,
      inject: [ConfigService],
      useFactory: buildSessionConfiguration,
    },
    {
      provide: SESSION_MIDDLEWARE,
      inject: [SESSION_CONFIGURATION, REDIS_CLIENT],
      useFactory: (
        configuration: SessionConfiguration,
        redisClient: RedisClientType,
      ) => {
        const store = new RedisStore({
          client: redisClient,
          prefix: configuration.keyPrefix,
          ttl: (storedSession) =>
            remainingSessionTtlSeconds(storedSession, configuration),
          disableTouch: false,
        });
        const options: SessionOptions = {
          name: configuration.cookieName,
          secret: configuration.secrets,
          store,
          cookie: configuration.cookie,
          resave: false,
          saveUninitialized: false,
          rolling: true,
          unset: 'destroy',
        };

        return session(options);
      },
    },
    {
      provide: SESSION_ABSOLUTE_EXPIRY_MIDDLEWARE,
      inject: [SESSION_CONFIGURATION],
      useFactory: createAbsoluteSessionExpiryMiddleware,
    },
    SessionService,
  ],
  exports: [
    SESSION_ABSOLUTE_EXPIRY_MIDDLEWARE,
    SESSION_CONFIGURATION,
    SESSION_MIDDLEWARE,
    SessionService,
  ],
})
export class SessionModule {}
