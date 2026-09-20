import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('redisUrl');
        return new Redis(url!, { maxRetriesPerRequest: 3 });
      },
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
