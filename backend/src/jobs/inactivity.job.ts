import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';
import type { AppConfiguration } from '../config/configuration.js';
import { RedisGeoService } from '../infra/redis-geo.service.js';

@Injectable()
export class InactivityJob {
  private readonly logger = new Logger(InactivityJob.name);
  private readonly timeoutHours: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject('DATABASE_POOL') private readonly pool: Pool,
    private readonly redisGeo: RedisGeoService,
    config: ConfigService<AppConfiguration>,
  ) {
    this.timeoutHours = config.get('inactivityTimeoutHours') ?? 3;
  }

  start(intervalMs: number) {
    if (this.intervalId) return;
    this.logger.log(`Starting inactivity job every ${intervalMs}ms (timeout: ${this.timeoutHours}h)`);
    this.intervalId = setInterval(() => this.run(), intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async run() {
    try {
      await this.closeInactiveShifts();
      await this.closeZeroPingShifts();
      await this.sweepPhantomPins();
    } catch (err) {
      this.logger.error(`Inactivity job failed: ${err}`);
    }
  }

  private async closeInactiveShifts() {
    const timeoutMs = this.timeoutHours * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - timeoutMs);

    const stale = await this.pool.query(
      `SELECT j.id_jornada, j.id_vendedor, j.fecha_hora_inicio
         FROM public.jornadas j
        WHERE j.estado = 'ACTIVA'
          AND EXISTS (
            SELECT 1 FROM public.tracking_gps t
             WHERE t.id_jornada = j.id_jornada
               AND t.timestamp > j.fecha_hora_inicio
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.tracking_gps t
             WHERE t.id_jornada = j.id_jornada
               AND t.timestamp > $1
          )`,
      [cutoff],
    );

    for (const row of stale.rows) {
      const idJornada = row.id_jornada as string;
      const idVendedor = row.id_vendedor as string;

      await this.pool.query(
        `UPDATE public.jornadas
            SET estado = 'FINALIZADA',
                fecha_hora_fin = NOW(),
                cierre_automatico = true
          WHERE id_jornada = $1 AND estado = 'ACTIVA'`,
        [idJornada],
      );

      await this.redisGeo.zrem('geo:vendedores', `vendedor:${idVendedor}`);
      await this.redisGeo.del(`geo:vendedores:${idJornada}`);

      this.logger.log(`Closed inactive shift ${idJornada} for vendor ${idVendedor}`);
    }
  }

  // Bug #4: Close shifts that were opened but never received any GPS ping
  private async closeZeroPingShifts() {
    const timeoutMs = this.timeoutHours * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - timeoutMs);

    const orphaned = await this.pool.query(
      `SELECT j.id_jornada, j.id_vendedor
         FROM public.jornadas j
        WHERE j.estado = 'ACTIVA'
          AND j.fecha_hora_inicio < $1
          AND NOT EXISTS (
            SELECT 1 FROM public.tracking_gps t
             WHERE t.id_jornada = j.id_jornada
          )`,
      [cutoff],
    );

    for (const row of orphaned.rows) {
      const idJornada = row.id_jornada as string;
      const idVendedor = row.id_vendedor as string;

      await this.pool.query(
        `UPDATE public.jornadas
            SET estado = 'FINALIZADA',
                fecha_hora_fin = NOW(),
                cierre_automatico = true
          WHERE id_jornada = $1 AND estado = 'ACTIVA'`,
        [idJornada],
      );

      await this.redisGeo.zrem('geo:vendedores', `vendedor:${idVendedor}`);
      await this.redisGeo.del(`geo:vendedores:${idJornada}`);

      this.logger.log(`Closed zero-ping shift ${idJornada} for vendor ${idVendedor}`);
    }
  }

  // Bug #2: Sweep also DELs per-jornada keys for phantom vendors
  private async sweepPhantomPins() {
    const members = await this.redisGeo.zrange('geo:vendedores');
    if (members.length === 0) return;

    const vendorIds = members
      .filter((m) => m.startsWith('vendedor:'))
      .map((m) => m.replace('vendedor:', ''));

    if (vendorIds.length === 0) return;

    const active = await this.pool.query(
      `SELECT id_vendedor, id_jornada FROM public.jornadas WHERE estado = 'ACTIVA' AND id_vendedor = ANY($1)`,
      [vendorIds],
    );

    const activeMap = new Map(
      active.rows.map((r) => [r.id_vendedor as string, r.id_jornada as string]),
    );

    for (const member of members) {
      if (!member.startsWith('vendedor:')) continue;
      const idVendedor = member.replace('vendedor:', '');
      if (!activeMap.has(idVendedor)) {
        await this.redisGeo.zrem('geo:vendedores', member);
        // Also DEL the per-jornada key if we can find it
        const closedJornada = await this.pool.query(
          `SELECT id_jornada FROM public.jornadas WHERE id_vendedor = $1 ORDER BY fecha_hora_inicio DESC LIMIT 1`,
          [idVendedor],
        );
        if ((closedJornada.rowCount ?? 0) > 0) {
          const idJornada = closedJornada.rows[0].id_jornada as string;
          await this.redisGeo.del(`geo:vendedores:${idJornada}`);
        }
        this.logger.debug(`Swept phantom pin for vendor ${idVendedor}`);
      }
    }
  }
}
