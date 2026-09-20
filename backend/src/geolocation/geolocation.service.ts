import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import type { AppConfiguration } from '../config/configuration.js';
import type { RedisGeoService } from '../infra/redis-geo.service.js';
import type { TrackingPingDto } from './dto/tracking-ping.dto.js';
import type { TrackingPingResponse, TrackingStatusResponse } from './entities/tracking.entity.js';
import { GeolocationGateway } from './geolocation.gateway.js';
import { GeolocationRepository } from './geolocation.repository.js';

@Injectable()
export class GeolocationService {
  private readonly logger = new Logger(GeolocationService.name);
  private readonly toleranceMs: number;
  private readonly dedupWindowSec: number;

  constructor(
    private readonly geoRepo: GeolocationRepository,
    private readonly redisGeo: RedisGeoService,
    private readonly gateway: GeolocationGateway,
    config: ConfigService<AppConfiguration>,
  ) {
    this.toleranceMs = (config.get('trackingSkewToleranceSec') ?? 60) * 1000;
    this.dedupWindowSec = config.get('trackingDedupWindowSec') ?? 120;
  }

  async trackPing(
    idVendedor: string,
    dto: TrackingPingDto,
  ): Promise<TrackingPingResponse | { processing: true }> {
    const now = new Date();
    const timestamp = dto.timestamp_medicion
      ? new Date(dto.timestamp_medicion)
      : now;

    // Reject future pings beyond tolerance
    if (timestamp.getTime() > now.getTime() + this.toleranceMs) {
      throw new BadRequestException({
        error: 'VALIDATION_ERROR',
        message: 'timestamp_medicion está en el futuro.',
      });
    }

    // Resolve jornada
    const jornada = await this.geoRepo.resolveJornada(idVendedor);
    if (!jornada) {
      throw new ConflictException({
        error: 'NO_ACTIVE_SHIFT',
        message: 'No se encontró una jornada activa o finalizada para el vendedor.',
      });
    }

    // Check if jornada is ACTIVA
    const isActiva = jornada.estado === 'ACTIVA';

    // If FINALIZADA, check timestamp <= fecha_hora_fin
    if (!isActiva && jornada.fecha_hora_fin) {
      const finTime = new Date(jornada.fecha_hora_fin).getTime();
      if (timestamp.getTime() > finTime) {
        throw new ConflictException({
          error: 'NO_ACTIVE_SHIFT',
          message: 'El ping es posterior al cierre de la jornada.',
        });
      }
    }

    // Check vendor is active
    const isActive = await this.geoRepo.checkVendedorActivo(idVendedor);
    if (!isActive) {
      await this.geoRepo.removeFromRedis(idVendedor, jornada.id_jornada);
      throw new ForbiddenException({
        error: 'VENDOR_NOT_ACTIVE',
        message: 'El vendedor no está activo.',
      });
    }

    // REQ-GEO-004: Idempotent deduplication with pending state
    const dedupKey = `tracking:dedup:${jornada.id_jornada}:${timestamp.toISOString()}`;
    const nxResult = await this.redisGeo.setNx(dedupKey, 'pending', this.dedupWindowSec);

    // If Redis is unavailable, skip dedup and proceed to INSERT (Postgres is truth)
    if (nxResult !== 'REDIS_UNAVAILABLE') {
      if (nxResult === null) {
        // Key already exists — read the value
        const existing = await this.redisGeo.get(dedupKey);
        if (existing && existing !== 'pending') {
          // Already processed — return the previous id_tracking
          const prevId = parseInt(existing, 10);
          if (!isNaN(prevId)) {
            return {
              id_tracking: prevId,
              id_jornada: jornada.id_jornada,
              coordenadas: { lat: dto.lat, lng: dto.lng },
              timestamp: timestamp.toISOString(),
              distancia_km: null,
            };
          }
        }

        // Value is "pending" — another request is inserting; retry with backoff
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise((r) => setTimeout(r, 50));
          const retryVal = await this.redisGeo.get(dedupKey);
          if (retryVal && retryVal !== 'pending') {
            const retryId = parseInt(retryVal, 10);
            if (!isNaN(retryId)) {
              return {
                id_tracking: retryId,
                id_jornada: jornada.id_jornada,
                coordenadas: { lat: dto.lat, lng: dto.lng },
                timestamp: timestamp.toISOString(),
                distancia_km: null,
              };
            }
          }
        }

        // Still pending after retries — return 202
        return { processing: true };
      }
      // nxResult === 'OK' — we own the dedup key; proceed with INSERT
    }
    const inserted = await this.geoRepo.insertTracking(
      jornada.id_jornada,
      dto.lng,
      dto.lat,
      timestamp.toISOString(),
    );

    // Update dedup key with real id_tracking
    await this.redisGeo.set(dedupKey, String(inserted.id_tracking), this.dedupWindowSec);

    // Publish to Redis only if jornada is ACTIVA (best-effort)
    if (isActiva) {
      await this.geoRepo.publishToRedis(
        idVendedor,
        jornada.id_jornada,
        dto.lng,
        dto.lat,
      );

      // Broadcast position to subscribed clients via Socket.io
      this.gateway.broadcastVendorPosition(jornada.id_jornada, {
        id_vendedor: idVendedor,
        coordenadas: { lat: dto.lat, lng: dto.lng },
        timestamp: timestamp.toISOString(),
      });
    }

    return {
      id_tracking: inserted.id_tracking,
      id_jornada: jornada.id_jornada,
      coordenadas: inserted.coordenadas,
      timestamp: inserted.timestamp,
      distancia_km: null,
    };
  }

  async getTrackingStatus(idVendedor: string): Promise<TrackingStatusResponse> {
    return this.geoRepo.getTrackingStatus(idVendedor);
  }

  @OnEvent('shift.ended')
  async handleShiftEnded(payload: { id_jornada: string; id_vendedor: string }) {
    this.logger.log(`Shift ended: ${payload.id_jornada}, cleaning Redis geo`);
    await this.geoRepo.removeFromRedis(payload.id_vendedor, payload.id_jornada);
  }

  @OnEvent('order.revoked')
  handleOrderRevoked(payload: { id_pedido: string; motivo: 'completado' | 'cancelado' | 'rechazado' }) {
    this.logger.log(`Order revoked: ${payload.id_pedido}`);
    this.gateway.broadcastLocationRevoked(payload.id_pedido, payload.motivo);
  }
}
