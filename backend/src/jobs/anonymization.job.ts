import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';
import type { AppConfiguration } from '../config/configuration.js';

@Injectable()
export class AnonymizationJob {
  private readonly logger = new Logger(AnonymizationJob.name);
  private readonly hoursThreshold: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject('DATABASE_POOL') private readonly pool: Pool,
    config: ConfigService<AppConfiguration>,
  ) {
    this.hoursThreshold = config.get('anonymizeHours') ?? 72;
  }

  start(intervalMs: number) {
    if (this.intervalId) return;
    this.logger.log(`Starting anonymization job every ${intervalMs}ms (threshold: ${this.hoursThreshold}h)`);
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
      const result = await this.pool.query(
        `UPDATE public.pedidos
            SET ubicacion_entrega = NULL
          WHERE ubicacion_entrega IS NOT NULL
            AND estado NOT IN ('solicitado', 'en_curso')
            AND creado_el < NOW() - INTERVAL '1 hour' * $1`,
        [this.hoursThreshold],
      );

      if ((result.rowCount ?? 0) > 0) {
        this.logger.log(`Anonymized ${result.rowCount} pedidos`);
      }
    } catch (err) {
      this.logger.error(`Anonymization job failed: ${err}`);
    }
  }
}
