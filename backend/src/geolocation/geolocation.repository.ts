import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { RedisGeoService } from '../infra/redis-geo.service.js';

@Injectable()
export class GeolocationRepository {

  constructor(
    @Inject('DATABASE_POOL') private readonly pool: Pool,
    private readonly redisGeo: RedisGeoService,
  ) {}

  async resolveJornada(
    idVendedor: string,
  ): Promise<{ id_jornada: string; estado: string; fecha_hora_fin: Date | null } | null> {
    const result = await this.pool.query(
      `SELECT id_jornada, estado, fecha_hora_fin
         FROM public.jornadas
        WHERE id_vendedor = $1
          AND (estado = 'ACTIVA' OR estado = 'FINALIZADA')
        ORDER BY fecha_hora_inicio DESC
        LIMIT 1`,
      [idVendedor],
    );
    if ((result.rowCount ?? 0) === 0) return null;
    const row = result.rows[0];
    return {
      id_jornada: row.id_jornada as string,
      estado: row.estado as string,
      fecha_hora_fin: row.fecha_hora_fin as Date | null,
    };
  }

  async checkVendedorActivo(idVendedor: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT estado_vendedor FROM public.usuarios WHERE id_usuario = $1`,
      [idVendedor],
    );
    if ((result.rowCount ?? 0) === 0) return false;
    return result.rows[0].estado_vendedor === 'activo';
  }

  async insertTracking(
    idJornada: string,
    lng: number,
    lat: number,
    timestamp: string,
  ): Promise<{ id_tracking: number; coordenadas: { lat: number; lng: number }; timestamp: string }> {
    const result = await this.pool.query(
      `INSERT INTO public.tracking_gps (id_jornada, coordenadas, timestamp)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4)
       RETURNING id_tracking,
                 ST_AsGeoJSON(coordenadas)::json AS coordenadas,
                 timestamp`,
      [idJornada, lng, lat, timestamp],
    );
    const row = result.rows[0];
    const coords = row.coordenadas as { type: string; coordinates: [number, number] };
    return {
      id_tracking: row.id_tracking as number,
      coordenadas: { lat: coords.coordinates[1], lng: coords.coordinates[0] },
      timestamp: (row.timestamp as Date).toISOString(),
    };
  }

  async publishToRedis(
    idVendedor: string,
    idJornada: string,
    lng: number,
    lat: number,
  ): Promise<void> {
    await this.redisGeo.geoAdd('geo:vendedores', lng, lat, `vendedor:${idVendedor}`);
    await this.redisGeo.geoAdd(`geo:vendedores:${idJornada}`, lng, lat, `vendedor:${idVendedor}`);
    await this.redisGeo.expire(`geo:vendedores:${idJornada}`, 86400);
  }

  async removeFromRedis(idVendedor: string, idJornada: string): Promise<void> {
    await this.redisGeo.zrem('geo:vendedores', `vendedor:${idVendedor}`);
    await this.redisGeo.del(`geo:vendedores:${idJornada}`);
  }

  async getTrackingStatus(
    idVendedor: string,
  ): Promise<{ tracking: boolean; id_jornada: string | null; fecha_hora_inicio: string | null; ultima_posicion: { lat: number; lng: number; timestamp: string } | null }> {
    const jornada = await this.pool.query(
      `SELECT id_jornada, fecha_hora_inicio
         FROM public.jornadas
        WHERE id_vendedor = $1 AND estado = 'ACTIVA'`,
      [idVendedor],
    );
    if ((jornada.rowCount ?? 0) === 0) {
      return { tracking: false, id_jornada: null, fecha_hora_inicio: null, ultima_posicion: null };
    }
    const j = jornada.rows[0];
    const pos = await this.pool.query(
      `SELECT ST_AsGeoJSON(coordenadas)::json AS coordenadas, timestamp
         FROM public.tracking_gps
        WHERE id_jornada = $1
        ORDER BY timestamp DESC
        LIMIT 1`,
      [j.id_jornada],
    );
    let ultimaPosicion = null;
    if ((pos.rowCount ?? 0) > 0) {
      const coords = pos.rows[0].coordenadas as { type: string; coordinates: [number, number] };
      ultimaPosicion = {
        lat: coords.coordinates[1],
        lng: coords.coordinates[0],
        timestamp: (pos.rows[0].timestamp as Date).toISOString(),
      };
    }
    return {
      tracking: true,
      id_jornada: j.id_jornada as string,
      fecha_hora_inicio: (j.fecha_hora_inicio as Date).toISOString(),
      ultima_posicion: ultimaPosicion,
    };
  }
}
