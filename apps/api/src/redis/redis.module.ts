import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    RedisService,
    {
      provide: REDIS_CLIENT,
      inject: [RedisService],
      useFactory: (redis: RedisService) => redis.getClient(),
    },
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
