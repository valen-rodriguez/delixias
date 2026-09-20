import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisGeoService } from './redis-geo.service.js';

@Global()
@Module({
  providers: [
    RedisGeoService,
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('redisUrl');
        const client = new Redis(url!, {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        });
        client.on('error', (error: Error) => {
          // Redis operations are best-effort; service methods handle degradation.
          // Keep connection errors from becoming unhandled process events.
          console.warn(`[Redis] Connection unavailable: ${error.message}`);
        });
        return client;
      },
    },
  ],
  exports: ['REDIS_CLIENT', RedisGeoService],
})
export class RedisModule {}
