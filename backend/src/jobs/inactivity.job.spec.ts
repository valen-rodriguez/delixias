import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';
import { InactivityJob } from './inactivity.job.js';
import type { RedisGeoService } from '../infra/redis-geo.service.js';
import type { OrdersService } from '../orders/orders.service.js';
import type { AppConfiguration } from '../config/configuration.js';

describe('InactivityJob', () => {
  let pool: { query: ReturnType<typeof vi.fn> };
  let redisGeo: { zrange: ReturnType<typeof vi.fn>; zrem: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> };
  let ordersService: { closeShiftAndCancelPendingOrders: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    pool = { query: vi.fn() };
    redisGeo = { zrange: vi.fn().mockResolvedValue([]), zrem: vi.fn(), del: vi.fn() };
    ordersService = {
      closeShiftAndCancelPendingOrders: vi.fn().mockResolvedValue({
        id_jornada: 'j1',
        id_vendedor: 'v1',
        cerrados: [],
        yaFinalizada: false,
      }),
    };
  });

  function makeJob(): InactivityJob {
    const config = {
      get: vi.fn((key: string) =>
        key === 'inactivityTimeoutHours' ? 3 : undefined,
      ),
    } as unknown as ConfigService<AppConfiguration>;
    return new InactivityJob(
      pool as unknown as Pool,
      redisGeo as unknown as RedisGeoService,
      ordersService as unknown as OrdersService,
      config,
    );
  }

  function mockPoolByQuery(): void {
    pool.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FROM public.jornadas j') && String(sql).includes('tracking_gps')) {
        return { rows: [{ id_jornada: 'j1', id_vendedor: 'v1' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
  }

  it('delega el cierre en OrdersService.closeShiftAndCancelPendingOrders', async () => {
    mockPoolByQuery();
    await makeJob().run();
    expect(
      ordersService.closeShiftAndCancelPendingOrders,
    ).toHaveBeenCalledWith(
      'j1',
      'Jornada finalizada automáticamente por inactividad',
    );
  });

  it('limpia Redis después del cierre coordinado', async () => {
    mockPoolByQuery();
    await makeJob().run();
    expect(redisGeo.zrem).toHaveBeenCalledWith('geo:vendedores', 'vendedor:v1');
    expect(redisGeo.del).toHaveBeenCalledWith('geo:vendedores:j1');
  });

  it('nunca ejecuta un UPDATE public.jornadas directo', async () => {
    mockPoolByQuery();
    await makeJob().run();
    const directUpdate = pool.query.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE public.jornadas'),
    );
    expect(directUpdate).toBeUndefined();
  });

  it('no ejecuta el cierre coordinado si no hay jornadas stale', async () => {
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await makeJob().run();
    expect(
      ordersService.closeShiftAndCancelPendingOrders,
    ).not.toHaveBeenCalled();
  });

  it('continúa procesando el lote si una jornada falla', async () => {
    const secondCall = { id_jornada: 'j2', id_vendedor: 'v2', cerrados: [], yaFinalizada: false };
    ordersService.closeShiftAndCancelPendingOrders.mockImplementation(async (idJornada: string) => {
      if (idJornada === 'j1') throw new Error('db error');
      return secondCall;
    });

    pool.query.mockImplementation(async () => ({
      rows: [{ id_jornada: 'j1', id_vendedor: 'v1' }, { id_jornada: 'j2', id_vendedor: 'v2' }],
      rowCount: 2,
    }));

    await makeJob().run();

    expect(ordersService.closeShiftAndCancelPendingOrders).toHaveBeenCalledTimes(4);
    expect(redisGeo.del).toHaveBeenCalledWith('geo:vendedores:j2');
  });

  it('el código fuente no contiene UPDATE public.jornadas (regresión)', () => {
    const source = readFileSync(
      new URL('./inactivity.job.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toContain('UPDATE public.jornadas');
  });
});
