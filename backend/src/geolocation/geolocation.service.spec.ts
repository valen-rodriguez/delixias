import { BadRequestException } from '@nestjs/common';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { GeolocationService } from './geolocation.service.js';
import type { TrackingPingDto } from './dto/tracking-ping.dto.js';

function createMockConfig(overrides: Record<string, number> = {}) {
  return {
    get: (key: string) => overrides[key] ?? (key === 'trackingSkewToleranceSec' ? 60 : key === 'trackingDedupWindowSec' ? 120 : undefined),
  } as any;
}

describe('GeolocationService', () => {
  let service: GeolocationService;
  let geoRepo: any;
  let redisGeo: any;
  let gateway: any;

  beforeEach(() => {
    geoRepo = {
      resolveJornada: vi.fn(),
      checkVendedorActivo: vi.fn(),
      insertTracking: vi.fn(),
      publishToRedis: vi.fn(),
      removeFromRedis: vi.fn(),
      getTrackingStatus: vi.fn(),
    };
    redisGeo = {
      geoAdd: vi.fn(),
      expire: vi.fn(),
      zrem: vi.fn(),
      del: vi.fn(),
      setNx: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
    };
    gateway = {
      broadcastVendorPosition: vi.fn(),
    };
    service = new GeolocationService(
      geoRepo,
      redisGeo,
      gateway,
      createMockConfig(),
    );
  });

  describe('trackPing', () => {
    const dto: TrackingPingDto = {
      lat: -38.005,
      lng: -57.542,
      timestamp_medicion: '2026-09-11T15:00:07.000Z',
    };

    it('should insert tracking and publish to Redis for ACTIVE shift', async () => {
      redisGeo.setNx.mockResolvedValue('OK');
      geoRepo.resolveJornada.mockResolvedValue({
        id_jornada: 'j-1',
        estado: 'ACTIVA',
        fecha_hora_fin: null,
      });
      geoRepo.checkVendedorActivo.mockResolvedValue(true);
      geoRepo.insertTracking.mockResolvedValue({
        id_tracking: 100,
        coordenadas: { lat: -38.005, lng: -57.542 },
        timestamp: '2026-09-11T15:00:07.000Z',
      });
      redisGeo.set.mockResolvedValue('OK');

      const result = await service.trackPing('v-1', dto);

      expect('id_tracking' in result).toBe(true);
      if ('id_tracking' in result) {
        expect(result.id_tracking).toBe(100);
        expect(result.id_jornada).toBe('j-1');
      }
      expect(geoRepo.publishToRedis).toHaveBeenCalledWith('v-1', 'j-1', -57.542, -38.005);
      expect(gateway.broadcastVendorPosition).toHaveBeenCalledWith('j-1', {
        id_vendedor: 'v-1',
        coordenadas: { lat: -38.005, lng: -57.542 },
        timestamp: '2026-09-11T15:00:07.000Z',
      });
    });

    it('should return existing id_tracking for duplicate ping within window', async () => {
      geoRepo.resolveJornada.mockResolvedValue({
        id_jornada: 'j-1',
        estado: 'ACTIVA',
        fecha_hora_fin: null,
      });
      geoRepo.checkVendedorActivo.mockResolvedValue(true);
      redisGeo.setNx.mockResolvedValue(null);
      redisGeo.get.mockResolvedValue('999');

      const result = await service.trackPing('v-1', dto);

      expect('id_tracking' in result).toBe(true);
      if ('id_tracking' in result) {
        expect(result.id_tracking).toBe(999);
      }
      expect(geoRepo.insertTracking).not.toHaveBeenCalled();
    });

    it('should return processing: true when dedup key is pending', async () => {
      geoRepo.resolveJornada.mockResolvedValue({
        id_jornada: 'j-1',
        estado: 'ACTIVA',
        fecha_hora_fin: null,
      });
      geoRepo.checkVendedorActivo.mockResolvedValue(true);
      redisGeo.setNx.mockResolvedValue(null);
      redisGeo.get.mockResolvedValue('pending');

      const result = await service.trackPing('v-1', dto);

      expect('processing' in result).toBe(true);
      if ('processing' in result) {
        expect(result.processing).toBe(true);
      }
    });

    it('should reject future timestamps beyond tolerance', async () => {
      const futureDto: TrackingPingDto = {
        lat: -38.005,
        lng: -57.542,
        timestamp_medicion: new Date(Date.now() + 120_000).toISOString(),
      };

      await expect(service.trackPing('v-1', futureDto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should throw NO_ACTIVE_SHIFT when no jornada exists', async () => {
      redisGeo.setNx.mockResolvedValue('OK');
      geoRepo.resolveJornada.mockResolvedValue(null);

      await expect(service.trackPing('v-1', dto)).rejects.toThrow();
    });

    it('should throw VENDOR_NOT_ACTIVE when vendor is suspended', async () => {
      redisGeo.setNx.mockResolvedValue('OK');
      geoRepo.resolveJornada.mockResolvedValue({
        id_jornada: 'j-1',
        estado: 'ACTIVA',
        fecha_hora_fin: null,
      });
      geoRepo.checkVendedorActivo.mockResolvedValue(false);

      await expect(service.trackPing('v-1', dto)).rejects.toThrow();
      expect(geoRepo.removeFromRedis).toHaveBeenCalledWith('v-1', 'j-1');
    });

    it('should accept buffer pings for FINALIZADA shift when timestamp <= fecha_hora_fin', async () => {
      redisGeo.setNx.mockResolvedValue('OK');
      geoRepo.resolveJornada.mockResolvedValue({
        id_jornada: 'j-1',
        estado: 'FINALIZADA',
        fecha_hora_fin: new Date('2026-09-11T16:00:00.000Z'),
      });
      geoRepo.checkVendedorActivo.mockResolvedValue(true);
      geoRepo.insertTracking.mockResolvedValue({
        id_tracking: 101,
        coordenadas: { lat: -38.005, lng: -57.542 },
        timestamp: '2026-09-11T15:00:07.000Z',
      });
      redisGeo.set.mockResolvedValue('OK');

      const result = await service.trackPing('v-1', dto);

      expect('id_tracking' in result).toBe(true);
      if ('id_tracking' in result) {
        expect(result.id_tracking).toBe(101);
      }
      expect(geoRepo.publishToRedis).not.toHaveBeenCalled();
      expect(gateway.broadcastVendorPosition).not.toHaveBeenCalled();
    });

    it('should reject buffer ping when timestamp > fecha_hora_fin', async () => {
      redisGeo.setNx.mockResolvedValue('OK');
      geoRepo.resolveJornada.mockResolvedValue({
        id_jornada: 'j-1',
        estado: 'FINALIZADA',
        fecha_hora_fin: new Date('2026-09-11T14:00:00.000Z'),
      });

      await expect(service.trackPing('v-1', dto)).rejects.toThrow();
    });
  });

  describe('getTrackingStatus', () => {
    it('should return tracking status from repository', async () => {
      geoRepo.getTrackingStatus.mockResolvedValue({
        tracking: true,
        id_jornada: 'j-1',
        fecha_hora_inicio: '2026-09-11T15:00:00.000Z',
        ultima_posicion: { lat: -38.005, lng: -57.542, timestamp: '2026-09-11T15:20:00.000Z' },
      });

      const result = await service.getTrackingStatus('v-1');
      expect(result.tracking).toBe(true);
      expect(result.id_jornada).toBe('j-1');
    });
  });

  describe('handleShiftEnded', () => {
    it('should remove vendor from Redis on shift ended', async () => {
      await service.handleShiftEnded({ id_jornada: 'j-1', id_vendedor: 'v-1' });
      expect(geoRepo.removeFromRedis).toHaveBeenCalledWith('v-1', 'j-1');
    });
  });
});
