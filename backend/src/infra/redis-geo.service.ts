import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

export interface GeoMember {
  member: string;
  distance_m: number;
  coordinates: { lng: number; lat: number };
}

@Injectable()
export class RedisGeoService {
  private readonly logger = new Logger(RedisGeoService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async geoAdd(
    key: string,
    lng: number,
    lat: number,
    member: string,
  ): Promise<void> {
    try {
      await this.redis.geoadd(key, lng, lat, member);
    } catch (err) {
      this.logger.warn(`GEOADD failed for ${key}: ${err}`);
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.redis.expire(key, seconds);
    } catch (err) {
      this.logger.warn(`EXPIRE failed for ${key}: ${err}`);
    }
  }

  async georadius(
    key: string,
    lng: number,
    lat: number,
    radiusM: number,
  ): Promise<GeoMember[]> {
    try {
      const result = await this.redis.georadius(
        key,
        lng,
        lat,
        radiusM,
        'm',
        'WITHDIST',
        'WITHCOORD',
        'ASC',
      );
      return result.map((item: any) => ({
        member: item[0] as string,
        distance_m: parseFloat(item[1] as string),
        coordinates: {
          lng: (item[2] as [number, number])[0],
          lat: (item[2] as [number, number])[1],
        },
      }));
    } catch (err) {
      this.logger.warn(`GEORADIUS failed for ${key}: ${err}`);
      return [];
    }
  }

  async geopos(
    key: string,
    member: string,
  ): Promise<{ lng: number; lat: number } | null> {
    try {
      const result = await this.redis.geopos(key, member);
      if (!result || !result[0]) return null;
      return { lng: parseFloat(result[0][0] as unknown as string), lat: parseFloat(result[0][1] as unknown as string) };
    } catch (err) {
      this.logger.warn(`GEOPOS failed for ${key}: ${err}`);
      return null;
    }
  }

  async zrem(key: string, ...members: string[]): Promise<void> {
    try {
      await this.redis.zrem(key, ...members);
    } catch (err) {
      this.logger.warn(`ZREM failed for ${key}: ${err}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn(`DEL failed for ${key}: ${err}`);
    }
  }

  async zrange(key: string): Promise<string[]> {
    try {
      return await this.redis.zrange(key, '0', '-1');
    } catch (err) {
      this.logger.warn(`ZRANGE failed for ${key}: ${err}`);
      return [];
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.redis.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.redis.set(key, value);
      }
    } catch (err) {
      this.logger.warn(`SET failed for ${key}: ${err}`);
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (err) {
      this.logger.warn(`GET failed for ${key}: ${err}`);
      return null;
    }
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<'OK' | null | 'REDIS_UNAVAILABLE'> {
    try {
      return await this.redis.set(key, value, 'EX', ttlSeconds, 'NX');
    } catch (err) {
      this.logger.warn(`SET NX failed for ${key}: ${err}`);
      return 'REDIS_UNAVAILABLE';
    }
  }
}
