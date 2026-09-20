import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  MermaExceedsStockError,
  NoActiveShiftError,
  NoStockAvailableError,
  ProductNotInJornadaError,
  ShiftAlreadyActiveError,
  ShiftHasPendingOrdersError,
  ShiftsRepository,
  VendedorNotActiveError,
} from './shifts.repository.js';
import type { StartShiftDto } from './dto/start-shift.dto.js';

type QueryResultLike = { rows: unknown[]; rowCount: number };

function qr(rows: unknown[], rowCount?: number): QueryResultLike {
  return { rows, rowCount: rowCount ?? rows.length };
}

function sequence(values: Array<unknown | Error>): ReturnType<typeof vi.fn> {
  const list = [...values];
  let call = 0;
  return vi.fn(async () => {
    if (call >= list.length) {
      throw new Error(`Unexpected extra query #${call + 1}`);
    }
    const next = list[call++];
    if (next instanceof Error) throw next;
    return next;
  });
}

function makeMocks(): { pool: Pool; client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> } } {
  const client = { query: vi.fn(), release: vi.fn() };
  const pool = {
    query: vi.fn(),
    connect: vi.fn(async () => client),
  };
  return { pool: pool as unknown as Pool, client };
}

function makeRepo(pool: Pool): ShiftsRepository {
  return new ShiftsRepository(pool);
}

const PRODUCT_1 = {
  id_producto: 'p1',
  nombre: 'Empanada a caballo',
  precio_unitario: '2100',
  stock_base: 10,
  foto_url: null,
};
const PRODUCT_2 = {
  id_producto: 'p2',
  nombre: 'Docena de facturas',
  precio_unitario: '3500',
  stock_base: 35,
  foto_url: 'https://wyrjgmzsnixpqydvrmrw.supabase.co/storage/v1/object/public/productos/facturas.jpg',
};

const INVENTARIO_1 = {
  id_producto: 'p1',
  nombre: 'Empanada a caballo',
  precio_unitario: '2100',
  foto_url: null,
  stock_inicial: 10,
  stock_actual: 10,
};

const SNAPSHOT = {
  fecha_snapshot: '2026-09-10T15:00:00Z',
  total_unidades: 45,
  items: [
    { id_producto: 'p1', nombre: 'Empanada a caballo', precio_unitario: 2100, cantidad_inicial: 10 },
    { id_producto: 'p2', nombre: 'Docena de facturas', precio_unitario: 3500, cantidad_inicial: 35 },
  ],
};

const JORNADA_ROW = {
  id_jornada: 'j1',
  id_vendedor: 'v1',
  estado: 'ACTIVA',
  fecha_hora_inicio: new Date('2026-09-10T15:00:00Z'),
  fecha_hora_fin: null,
  coordenada_inicio: { type: 'Point', coordinates: [-57.5426106, -38.0054771] },
  stock_inicial_consolidado: SNAPSHOT,
};

const INSERTED_JORNADA = {
  id_jornada: 'j1',
  estado: 'ACTIVA',
  fecha_hora_inicio: new Date('2026-09-10T15:00:00Z'),
  coordenada_inicio: { type: 'Point', coordinates: [-57.5426106, -38.0054771] },
  stock_inicial_consolidado: SNAPSHOT,
};

const FINALIZED_JORNADA = {
  id_jornada: 'j1',
  id_vendedor: 'v1',
  estado: 'FINALIZADA',
  fecha_hora_inicio: new Date('2026-09-10T15:00:00Z'),
  fecha_hora_fin: new Date('2026-09-10T20:30:00Z'),
  coordenada_inicio: { type: 'Point', coordinates: [-57.5426106, -38.0054771] },
  stock_inicial_consolidado: SNAPSHOT,
};

const START_DTO: StartShiftDto = { lat: -38.0054771, lng: -57.5426106 };

describe('ShiftsRepository', () => {
  describe('findCurrentShift', () => {
    it('devuelve null sin jornada activa', async () => {
      const { pool } = makeMocks();
      pool.query.mockResolvedValueOnce(qr([], 0));
      const shift = await makeRepo(pool).findCurrentShift('v1');
      expect(shift).toBeNull();
    });

    it('devuelve la jornada activa con inventario vivo', async () => {
      const { pool } = makeMocks();
      pool.query.mockResolvedValueOnce(qr([JORNADA_ROW], 1));
      pool.query.mockResolvedValueOnce(qr([INVENTARIO_1], 1));
      const shift = await makeRepo(pool).findCurrentShift('v1');
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM public.jornadas j'),
        ['v1'],
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM public.inventario_jornada ij'),
        ['j1'],
      );
      expect(shift).toMatchObject({
        id_jornada: 'j1',
        id_vendedor: 'v1',
        estado: 'ACTIVA',
        stock_inicial_consolidado: {
          total_unidades: 45,
          items: [
            { id_producto: 'p1', nombre: 'Empanada a caballo', precio_unitario: 2100, cantidad_inicial: 10 },
            { id_producto: 'p2', nombre: 'Docena de facturas', precio_unitario: 3500, cantidad_inicial: 35 },
          ],
        },
        inventario: [
          { id_producto: 'p1', stock_inicial: 10, stock_actual: 10 },
        ],
      });
      expect(shift && 'fecha_hora_fin' in shift).toBe(false);
    });
  });

  describe('startShift', () => {
    it('rechaza vendedor no activo con VendedorNotActiveError', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ estado_vendedor: 'suspendido' }], 1),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).startShift('v1', START_DTO),
      ).rejects.toBeInstanceOf(VendedorNotActiveError);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });

    it('rechaza sin mercadería con NoStockAvailableError', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ estado_vendedor: 'activo' }], 1),
        qr([], 0),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).startShift('v1', START_DTO),
      ).rejects.toBeInstanceOf(NoStockAvailableError);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('rechaza con jornada ya activa (pre-check) con ShiftAlreadyActiveError', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ estado_vendedor: 'activo' }], 1),
        qr([PRODUCT_1], 1),
        qr([], 1),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).startShift('v1', START_DTO),
      ).rejects.toBeInstanceOf(ShiftAlreadyActiveError);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('mapea 23505 a ShiftAlreadyActiveError (guerra contra la race condition)', async () => {
      const { pool, client } = makeMocks();
      const uniqueViolation = Object.assign(new Error('duplicate key'), {
        code: '23505',
      });
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ estado_vendedor: 'activo' }], 1),
        qr([PRODUCT_1], 1),
        qr([], 0),
        uniqueViolation,
        qr([]),
      ]));
      await expect(
        makeRepo(pool).startShift('v1', START_DTO),
      ).rejects.toBeInstanceOf(ShiftAlreadyActiveError);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('re-lanza errores no relacionados con el índice único', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ estado_vendedor: 'activo' }], 1),
        qr([PRODUCT_1], 1),
        qr([], 0),
        new Error('db disconnected'),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).startShift('v1', START_DTO),
      ).rejects.toThrow('db disconnected');
    });

    it('valida en orden: estado activo, stock>0 y jornada única', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ estado_vendedor: 'suspendido' }], 1),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).startShift('v1', START_DTO),
      ).rejects.toBeInstanceOf(VendedorNotActiveError);
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT estado_vendedor'),
        ['v1'],
      );
      expect(client.query).not.toHaveBeenCalledWith(
        expect.stringContaining('FROM public.productos'),
      );

      client.query.mockReset();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ estado_vendedor: 'activo' }], 1),
        qr([], 0),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).startShift('v1', START_DTO),
      ).rejects.toBeInstanceOf(NoStockAvailableError);
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM public.productos'),
        ['v1'],
      );
      expect(client.query).not.toHaveBeenCalledWith(
        expect.stringContaining('FROM public.jornadas'),
      );
    });

    it('crea la jornada, copia inventario y escribe kárdex INGRESO', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ estado_vendedor: 'activo' }], 1),
        qr([PRODUCT_1, PRODUCT_2], 2),
        qr([], 0),
        qr([INSERTED_JORNADA], 1),
        qr([], 1),
        qr([], 1),
        qr([], 1),
        qr([], 1),
        qr([]),
      ]));

      const shift = await makeRepo(pool).startShift('v1', START_DTO);

      expect(client.query).toHaveBeenCalledWith('BEGIN');
      expect(client.query).toHaveBeenCalledWith('COMMIT');

      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.jornadas'),
        ['v1', START_DTO.lng, START_DTO.lat, expect.any(Object)],
      );

      const inventarioInserts = client.query.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO public.inventario_jornada'),
      );
      expect(inventarioInserts).toHaveLength(2);
      expect(inventarioInserts[0][1]).toEqual(['j1', 'p1', 10]);
      expect(inventarioInserts[1][1]).toEqual(['j1', 'p2', 35]);

      const kardexInserts = client.query.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO public.movimientos_stock'),
      );
      expect(kardexInserts).toHaveLength(2);
      expect(kardexInserts[0][1]).toEqual(['p1', 'j1', 10, 'v1']);
      expect(kardexInserts[1][1]).toEqual(['p2', 'j1', 35, 'v1']);

      expect(shift).toMatchObject({
        id_vendedor: 'v1',
        estado: 'ACTIVA',
        coordenada_inicio: { lat: -38.0054771, lng: -57.5426106 },
        stock_inicial_consolidado: {
          total_unidades: 45,
          items: [
            { id_producto: 'p1', cantidad_inicial: 10 },
            { id_producto: 'p2', cantidad_inicial: 35 },
          ],
        },
        inventario: [
          { id_producto: 'p1', stock_inicial: 10, stock_actual: 10 },
          { id_producto: 'p2', stock_inicial: 35, stock_actual: 35 },
        ],
      });
    });
  });

  describe('endShift', () => {
    it('devuelve NoActiveShiftError si no hay jornada activa', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([], 0),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).endShift('v1'),
      ).rejects.toBeInstanceOf(NoActiveShiftError);
      expect(client.query).toHaveBeenCalledWith(
        expect.stringMatching(/FROM public\.jornadas/),
        ['v1'],
      );
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('usa FOR UPDATE para serializar operaciones concurrentes', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ id_jornada: 'j1' }], 1),
        qr([], 0),
        qr([FINALIZED_JORNADA], 1),
        qr([INVENTARIO_1], 1),
        qr([]),
      ]));
      await makeRepo(pool).endShift('v1');
      const forUpdateCall = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('FOR UPDATE'),
      );
      expect(forUpdateCall).toBeDefined();
    });

    it('rechaza con pedidos pendientes en solicitado/en_curso', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ id_jornada: 'j1' }], 1),
        qr([], 1),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).endShift('v1'),
      ).rejects.toBeInstanceOf(ShiftHasPendingOrdersError);
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining("IN ('solicitado', 'en_curso')"),
        ['j1'],
      );
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('finaliza la jornada, setea cierre_automatico=false y devuelve el inventario', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ id_jornada: 'j1' }], 1),
        qr([], 0),
        qr([FINALIZED_JORNADA], 1),
        qr([INVENTARIO_1], 1),
        qr([]),
      ]));

      const shift = await makeRepo(pool).endShift('v1');

      const updateCall = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE public.jornadas'),
      );
      expect(updateCall).toBeDefined();
      expect(String(updateCall[0])).toContain('cierre_automatico = false');
      expect(updateCall[1]).toEqual(['j1', 'v1']);

      expect(shift).toMatchObject({
        id_jornada: 'j1',
        id_vendedor: 'v1',
        estado: 'FINALIZADA',
        fecha_hora_fin: '2026-09-10T20:30:00.000Z',
        coordenada_inicio: { lat: -38.0054771, lng: -57.5426106 },
        inventario: [{ id_producto: 'p1', stock_actual: 10 }],
      });
    });

    it('lanza NoActiveShiftError si el UPDATE defensivo retorna 0 filas', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ id_jornada: 'j1' }], 1),
        qr([], 0),
        qr([], 0),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).endShift('v1'),
      ).rejects.toBeInstanceOf(NoActiveShiftError);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('registerMerma', () => {
    it('lanza NoActiveShiftError si no hay jornada activa', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([], 0),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).registerMerma('v1', 'p1', 5, 'motivo'),
      ).rejects.toBeInstanceOf(NoActiveShiftError);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('lanza ProductNotInJornadaError si el producto no está en inventario', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ id_jornada: 'j1' }], 1),
        qr([], 0),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).registerMerma('v1', 'p_no_existente', 5, 'motivo'),
      ).rejects.toBeInstanceOf(ProductNotInJornadaError);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('lanza MermaExceedsStockError si cantidad > stock_actual', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ id_jornada: 'j1' }], 1),
        qr([{ stock_actual: 3 }], 1),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).registerMerma('v1', 'p1', 5, 'motivo'),
      ).rejects.toBeInstanceOf(MermaExceedsStockError);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('ejecuta merma: descuenta inventario y escribe kárdex MERMA (stock_base no se modifica)', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ id_jornada: 'j1' }], 1),
        qr([{ stock_actual: 10 }], 1),
        qr([], 1),
        qr([], 1),
        qr([]),
      ]));

      const result = await makeRepo(pool).registerMerma('v1', 'p1', 3, 'Producto caído');

      expect(client.query).toHaveBeenCalledWith('BEGIN');
      expect(client.query).toHaveBeenCalledWith('COMMIT');

      const updateInventario = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE public.inventario_jornada'),
      );
      expect(updateInventario).toBeDefined();
      expect(updateInventario[1]).toEqual(['j1', 'p1', 7]);

      const insertKardex = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO public.movimientos_stock'),
      );
      expect(insertKardex).toBeDefined();
      expect(insertKardex[1]).toEqual(['p1', 'j1', 3, 'Producto caído', 7, 'v1']);

      const updateStockBase = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE public.productos') && String(sql).includes('stock_base'),
      );
      expect(updateStockBase).toBeUndefined();

      expect(result).toMatchObject({
        id_producto: 'p1',
        stock_actual_anterior: 10,
        stock_actual_nuevo: 7,
        cantidad_mermada: 3,
        motivo: 'Producto caído',
      });
    });
  });
});
