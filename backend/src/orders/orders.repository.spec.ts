import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  ConcurrentOperationError,
  CancellationReasonRequiredError,
  InsufficientStockError,
  InvalidOrderTransitionError,
  NoActiveShiftError,
  OrderExpiredError,
  OrderNotFoundError,
  OrdersRepository,
  PaymentMethodNotAvailableError,
  ProductNotAvailableError,
  ProductNotInShiftError,
} from './orders.repository.js';
import type { CreateOrderInput } from './orders.repository.js';

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

function makeMocks(): {
  pool: Pool & { query: ReturnType<typeof vi.fn> };
  client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
} {
  const client = { query: vi.fn(), release: vi.fn() };
  const pool = { query: vi.fn(), connect: vi.fn(async () => client) };
  return {
    pool: pool as unknown as Pool & { query: ReturnType<typeof vi.fn> },
    client,
  };
}

function makeRepo(pool: Pool): OrdersRepository {
  return new OrdersRepository(pool);
}

const V = 'vendedor-1';
const C = 'cliente-1';
const J = 'jornada-1';
const P1 = 'aaaa-1';
const PEDIDO = 'pedido-1';

const PEDIDO_LIST_ROW = {
  id_pedido: PEDIDO,
  id_jornada: J,
  id_vendedor: V,
  id_cliente: C,
  id_medio_pago: 1,
  estado: 'solicitado',
  cancelado_por: null,
  motivo_cancela: null,
  ubicacion_entrega: { type: 'Point', coordinates: [-57.5, -38.0] },
  total_orden: '2400.00',
  creado_el: new Date('2026-09-20T15:00:00Z'),
  expira_el: new Date('2026-09-20T15:03:00Z'),
};

const DETALLE_ROW = {
  id_producto: P1,
  cantidad: 2,
  precio_historico: '1200.00',
  origen_tipo: 'autonomo',
  id_origen: V,
};

const BASE_INPUT: CreateOrderInput = {
  id_vendedor: V,
  id_cliente: C,
  id_medio_pago: 1,
  ubicacion_entrega: { lat: -38.0, lng: -57.5 },
  lineas: [{ id_producto: P1, cantidad: 2 }],
};

describe('OrdersRepository', () => {
  describe('createOrder', () => {
    it('crea pedido de una línea, reserva stock e inserta detalle con precio de base', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]), // BEGIN
          qr([{ id_jornada: J }], 1), // jornada FOR SHARE
          qr([{ ok: 1 }], 1), // medio de pago
          qr([{ precio_unitario: '1200.00' }], 1), // producto
          qr([{ stock_actual: 5 }], 1), // inventario
          qr([], 1), // UPDATE inventario
          qr([PEDIDO_LIST_ROW], 1), // INSERT pedido
          qr([DETALLE_ROW], 1), // INSERT detalle
          qr([]), // COMMIT
        ]),
      );

      const pedido = await makeRepo(pool).createOrder(BASE_INPUT, 3);

      expect(client.query).toHaveBeenCalledWith('BEGIN');
      expect(client.query).toHaveBeenCalledWith('COMMIT');

      const reservation = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE public.inventario_jornada'),
      );
      expect(reservation![1]).toEqual([J, P1, 2]);

      const insertPedido = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO public.pedidos'),
      );
      expect(insertPedido![1]).toEqual([C, V, J, 1, -57.5, -38.0, 2400, 3]);

      const insertDetalle = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO public.detalle_pedidos'),
      );
      expect(insertDetalle![1]).toEqual([PEDIDO, P1, 2, 1200, V]);

      expect(pedido).toMatchObject({
        id_pedido: PEDIDO,
        id_cliente: C,
        id_vendedor: V,
        id_jornada: J,
        total_orden: 2400,
        lineas: [{ id_producto: P1, cantidad: 2, precio_historico: 1200 }],
      });
    });

    it('consolida líneas duplicadas del mismo producto antes de reservar', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_jornada: J }], 1),
          qr([{ ok: 1 }], 1),
          qr([{ precio_unitario: '1000.00' }], 1),
          qr([{ stock_actual: 10 }], 1),
          qr([], 1),
          qr([{ ...PEDIDO_LIST_ROW, total_orden: '3000.00' }], 1),
          qr([{ ...DETALLE_ROW, cantidad: 3, precio_historico: '1000.00' }], 1),
          qr([]),
        ]),
      );

      const pedido = await makeRepo(pool).createOrder(
        {
          ...BASE_INPUT,
          lineas: [
            { id_producto: P1, cantidad: 1 },
            { id_producto: P1, cantidad: 2 },
          ],
        },
        3,
      );

      const reservation = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE public.inventario_jornada'),
      );
      expect(reservation![1]).toEqual([J, P1, 3]);
      expect(pedido.lineas).toHaveLength(1);
      expect(pedido.lineas[0].cantidad).toBe(3);
    });

    it('responde NoActiveShiftError sin jornada activa', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([qr([]), qr([], 0), qr([])]),
      );
      await expect(makeRepo(pool).createOrder(BASE_INPUT, 3)).rejects.toBeInstanceOf(
        NoActiveShiftError,
      );
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('responde PaymentMethodNotAvailableError si el medio no está habilitado', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([qr([]), qr([{ id_jornada: J }], 1), qr([], 0), qr([])]),
      );
      await expect(makeRepo(pool).createOrder(BASE_INPUT, 3)).rejects.toBeInstanceOf(
        PaymentMethodNotAvailableError,
      );
    });

    it('responde ProductNotAvailableError si el producto es ajeno o inactivo', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_jornada: J }], 1),
          qr([{ ok: 1 }], 1),
          qr([], 0),
          qr([]),
        ]),
      );
      await expect(makeRepo(pool).createOrder(BASE_INPUT, 3)).rejects.toBeInstanceOf(
        ProductNotAvailableError,
      );
    });

    it('responde ProductNotInShiftError si el producto no está en la jornada', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_jornada: J }], 1),
          qr([{ ok: 1 }], 1),
          qr([{ precio_unitario: '1200.00' }], 1),
          qr([], 0),
          qr([]),
        ]),
      );
      await expect(makeRepo(pool).createOrder(BASE_INPUT, 3)).rejects.toBeInstanceOf(
        ProductNotInShiftError,
      );
    });

    it('responde InsufficientStockError si stock_actual < cantidad', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_jornada: J }], 1),
          qr([{ ok: 1 }], 1),
          qr([{ precio_unitario: '1200.00' }], 1),
          qr([{ stock_actual: 1 }], 1),
          qr([]),
        ]),
      );
      await expect(makeRepo(pool).createOrder(BASE_INPUT, 3)).rejects.toBeInstanceOf(
        InsufficientStockError,
      );
    });

    it('responde ConcurrentOperationError si el UPDATE condicional afecta 0 filas pero el stock alcanza', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_jornada: J }], 1),
          qr([{ ok: 1 }], 1),
          qr([{ precio_unitario: '1200.00' }], 1),
          qr([{ stock_actual: 5 }], 1),
          qr([], 0), // UPDATE condicional sin filas
          qr([{ stock_actual: 5 }], 1), // revalidación
          qr([]),
        ]),
      );
      await expect(makeRepo(pool).createOrder(BASE_INPUT, 3)).rejects.toBeInstanceOf(
        ConcurrentOperationError,
      );
    });
  });

  describe('acceptOrder', () => {
    it('transiciona solicitado → en_curso cuando la jornada sigue activa', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_pedido: PEDIDO, estado: 'solicitado', id_jornada: J, expira_el: null }], 1),
          qr([{ estado: 'ACTIVA' }], 1),
          qr([], 1),
          qr([{ ...PEDIDO_LIST_ROW, estado: 'en_curso' }], 1),
          qr([DETALLE_ROW], 1),
          qr([]),
        ]),
      );
      const pedido = await makeRepo(pool).acceptOrder(PEDIDO, V);
      expect(pedido.estado).toBe('en_curso');
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining("SET estado = 'en_curso'"),
        [PEDIDO],
      );
    });

    it('responde InvalidOrderTransitionError si el pedido no está solicitado', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_pedido: PEDIDO, estado: 'en_curso', id_jornada: J }], 1),
          qr([]),
        ]),
      );
      await expect(makeRepo(pool).acceptOrder(PEDIDO, V)).rejects.toBeInstanceOf(
        InvalidOrderTransitionError,
      );
    });

    it('responde OrderExpiredError si expira_el ya pasó', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr(
            [
              {
                id_pedido: PEDIDO,
                estado: 'solicitado',
                id_jornada: J,
                expira_el: new Date(Date.now() - 60_000),
              },
            ],
            1,
          ),
          qr([]),
        ]),
      );
      await expect(makeRepo(pool).acceptOrder(PEDIDO, V)).rejects.toBeInstanceOf(
        OrderExpiredError,
      );
    });

    it('responde OrderNotFoundError si el pedido no es del vendedor', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([qr([]), qr([], 0), qr([])]));
      await expect(makeRepo(pool).acceptOrder(PEDIDO, V)).rejects.toBeInstanceOf(
        OrderNotFoundError,
      );
    });
  });

  describe('rejectOrder', () => {
    it('restituye stock y marca rechazado', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_pedido: PEDIDO, estado: 'solicitado', id_jornada: J }], 1),
          qr([{ id_producto: P1, cantidad: 2 }], 1), // restoreStock select
          qr([], 1), // restoreStock update
          qr([], 1), // update estado
          qr([{ ...PEDIDO_LIST_ROW, estado: 'rechazado' }], 1),
          qr([DETALLE_ROW], 1),
          qr([]),
        ]),
      );
      const pedido = await makeRepo(pool).rejectOrder(PEDIDO, V);
      expect(pedido.estado).toBe('rechazado');
      const restore = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('stock_actual = stock_actual +'),
      );
      expect(restore![1]).toEqual([J, P1, 2]);
    });
  });

  describe('completeOrder', () => {
    it('escribe EGRESO_VENTA con saldo lógico del último movimiento (no stock_actual)', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_pedido: PEDIDO, estado: 'en_curso', id_jornada: J }], 1),
          qr([{ id_producto: P1, cantidad: 2 }], 1),
          qr([{ stock_inicial: 10 }], 1), // inventario FOR UPDATE
          qr([{ saldo_resultante: 10 }], 1), // último movimiento
          qr([], 1), // INSERT kárdex
          qr([], 1), // UPDATE estado
          qr([{ ...PEDIDO_LIST_ROW, estado: 'completado' }], 1),
          qr([DETALLE_ROW], 1),
          qr([]),
        ]),
      );
      const pedido = await makeRepo(pool).completeOrder(PEDIDO, V);
      expect(pedido.estado).toBe('completado');
      const kardex = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO public.movimientos_stock'),
      );
      expect(kardex![1]).toEqual([P1, J, 2, 8, V]);
      expect(String(kardex![0])).toContain("'EGRESO_VENTA'");
    });

    it('usa stock_inicial como saldo previo cuando no hay movimientos', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_pedido: PEDIDO, estado: 'en_curso', id_jornada: J }], 1),
          qr([{ id_producto: P1, cantidad: 2 }], 1),
          qr([{ stock_inicial: 7 }], 1),
          qr([], 0), // sin movimientos
          qr([], 1),
          qr([], 1),
          qr([{ ...PEDIDO_LIST_ROW, estado: 'completado' }], 1),
          qr([DETALLE_ROW], 1),
          qr([]),
        ]),
      );
      await makeRepo(pool).completeOrder(PEDIDO, V);
      const kardex = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO public.movimientos_stock'),
      );
      expect(kardex![1]).toEqual([P1, J, 2, 5, V]);
    });

    it('responde InvalidOrderTransitionError si no está en_curso', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_pedido: PEDIDO, estado: 'solicitado', id_jornada: J }], 1),
          qr([]),
        ]),
      );
      await expect(makeRepo(pool).completeOrder(PEDIDO, V)).rejects.toBeInstanceOf(
        InvalidOrderTransitionError,
      );
    });
  });

  describe('cancelOrder', () => {
    it('el cliente cancela sin motivo y se restituye stock', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr(
            [
              {
                id_pedido: PEDIDO,
                id_cliente: C,
                id_vendedor: V,
                estado: 'solicitado',
                id_jornada: J,
              },
            ],
            1,
          ),
          qr([{ id_producto: P1, cantidad: 2 }], 1),
          qr([], 1),
          qr([], 1),
          qr(
            [
              {
                ...PEDIDO_LIST_ROW,
                estado: 'cancelado',
                cancelado_por: 'cliente',
                motivo_cancela: 'Cancelado por el cliente',
              },
            ],
            1,
          ),
          qr([DETALLE_ROW], 1),
          qr([]),
        ]),
      );
      const pedido = await makeRepo(pool).cancelOrder(PEDIDO, C, undefined);
      expect(pedido.cancelado_por).toBe('cliente');
    });

    it('el vendedor requiere motivo no vacío', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr(
            [
              {
                id_pedido: PEDIDO,
                id_cliente: C,
                id_vendedor: V,
                estado: 'en_curso',
                id_jornada: J,
              },
            ],
            1,
          ),
          qr([]),
        ]),
      );
      await expect(
        makeRepo(pool).cancelOrder(PEDIDO, V, '   '),
      ).rejects.toBeInstanceOf(CancellationReasonRequiredError);
    });

    it('el vendedor solo cancela pedidos en_curso', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr(
            [
              {
                id_pedido: PEDIDO,
                id_cliente: C,
                id_vendedor: V,
                estado: 'solicitado',
                id_jornada: J,
              },
            ],
            1,
          ),
          qr([]),
        ]),
      );
      await expect(
        makeRepo(pool).cancelOrder(PEDIDO, V, 'El cliente se fue'),
      ).rejects.toBeInstanceOf(InvalidOrderTransitionError);
    });

    it('un actor ajeno recibe OrderNotFoundError', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr(
            [
              {
                id_pedido: PEDIDO,
                id_cliente: C,
                id_vendedor: V,
                estado: 'solicitado',
                id_jornada: J,
              },
            ],
            1,
          ),
          qr([]),
        ]),
      );
      await expect(
        makeRepo(pool).cancelOrder(PEDIDO, 'otro', 'x'),
      ).rejects.toBeInstanceOf(OrderNotFoundError);
    });
  });

  describe('expireTimedOutOrders', () => {
    it('cancela pedidos vencidos, restituye stock y los devuelve', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr(
            [
              {
                id_pedido: PEDIDO,
                id_cliente: C,
                id_vendedor: V,
                id_jornada: J,
              },
            ],
            1,
          ),
          qr([{ id_producto: P1, cantidad: 2 }], 1),
          qr([], 1),
          qr([], 1),
          qr([]),
        ]),
      );
      const expirados = await makeRepo(pool).expireTimedOutOrders(50);
      expect(expirados).toEqual([
        { id_pedido: PEDIDO, id_cliente: C, id_vendedor: V },
      ]);
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE SKIP LOCKED'),
        [50],
      );
    });
  });

  describe('closeShiftAndCancelPendingOrders', () => {
    it('cancela pendientes, restituye y finaliza la jornada con cierre_automatico', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_jornada: J, id_vendedor: V, estado: 'ACTIVA' }], 1),
          qr([{ id_pedido: PEDIDO, id_cliente: C, id_vendedor: V }], 1),
          qr([{ id_producto: P1, cantidad: 2 }], 1),
          qr([], 1),
          qr([], 1),
          qr([], 1),
          qr([]),
        ]),
      );
      const result = await makeRepo(pool).closeShiftAndCancelPendingOrders(
        J,
        'Jornada finalizada automáticamente por inactividad',
      );
      expect(result?.cerrados).toHaveLength(1);
      const finalize = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('cierre_automatico = true'),
      );
      expect(finalize).toBeDefined();
    });

    it('es idempotente: devuelve null si la jornada ya no está activa', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_jornada: J, id_vendedor: V, estado: 'FINALIZADA' }], 1),
          qr([]),
        ]),
      );
      const result = await makeRepo(pool).closeShiftAndCancelPendingOrders(J, 'x');
      expect(result).toBeNull();
      const finalize = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('SET estado = \'FINALIZADA\''),
      );
      expect(finalize).toBeUndefined();
    });
  });

  describe('ramas defensivas y de concurrencia', () => {
    it('crea sin ubicación cuando no se comparte (null)', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_jornada: J }], 1),
          qr([{ ok: 1 }], 1),
          qr([{ precio_unitario: '1200.00' }], 1),
          qr([{ stock_actual: 5 }], 1),
          qr([], 1),
          qr([{ ...PEDIDO_LIST_ROW, ubicacion_entrega: null }], 1),
          qr([DETALLE_ROW], 1),
          qr([]),
        ]),
      );
      await makeRepo(pool).createOrder(
        { ...BASE_INPUT, ubicacion_entrega: null },
        3,
      );
      const insertPedido = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO public.pedidos'),
      );
      expect(insertPedido![1]).toEqual([C, V, J, 1, null, null, 2400, 3]);
    });

    it('responde ProductNotInShiftError si la fila desaparece tras el UPDATE', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_jornada: J }], 1),
          qr([{ ok: 1 }], 1),
          qr([{ precio_unitario: '1200.00' }], 1),
          qr([{ stock_actual: 5 }], 1),
          qr([], 0),
          qr([], 0),
          qr([]),
        ]),
      );
      await expect(makeRepo(pool).createOrder(BASE_INPUT, 3)).rejects.toBeInstanceOf(
        ProductNotInShiftError,
      );
    });

    it('responde InsufficientStockError en la revalidación', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_jornada: J }], 1),
          qr([{ ok: 1 }], 1),
          qr([{ precio_unitario: '1200.00' }], 1),
          qr([{ stock_actual: 5 }], 1),
          qr([], 0),
          qr([{ stock_actual: 1 }], 1),
          qr([]),
        ]),
      );
      await expect(makeRepo(pool).createOrder(BASE_INPUT, 3)).rejects.toBeInstanceOf(
        InsufficientStockError,
      );
    });

    it('acceptOrder responde InvalidOrderTransitionError si la jornada no está activa', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_pedido: PEDIDO, estado: 'solicitado', id_jornada: J, expira_el: null }], 1),
          qr([{ estado: 'FINALIZADA' }], 1),
          qr([]),
        ]),
      );
      await expect(makeRepo(pool).acceptOrder(PEDIDO, V)).rejects.toBeInstanceOf(
        InvalidOrderTransitionError,
      );
    });

    it('rejectOrder responde OrderNotFoundError si no existe', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([qr([]), qr([], 0), qr([])]));
      await expect(makeRepo(pool).rejectOrder(PEDIDO, V)).rejects.toBeInstanceOf(
        OrderNotFoundError,
      );
    });

    it('rejectOrder responde InvalidOrderTransitionError si no está solicitado', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_pedido: PEDIDO, estado: 'en_curso', id_jornada: J }], 1),
          qr([]),
        ]),
      );
      await expect(makeRepo(pool).rejectOrder(PEDIDO, V)).rejects.toBeInstanceOf(
        InvalidOrderTransitionError,
      );
    });

    it('completeOrder responde OrderNotFoundError si no existe', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([qr([]), qr([], 0), qr([])]));
      await expect(makeRepo(pool).completeOrder(PEDIDO, V)).rejects.toBeInstanceOf(
        OrderNotFoundError,
      );
    });

    it('completeOrder responde ProductNotInShiftError si falta inventario', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr([{ id_pedido: PEDIDO, estado: 'en_curso', id_jornada: J }], 1),
          qr([{ id_producto: P1, cantidad: 2 }], 1),
          qr([], 0),
          qr([]),
        ]),
      );
      await expect(makeRepo(pool).completeOrder(PEDIDO, V)).rejects.toBeInstanceOf(
        ProductNotInShiftError,
      );
    });

    it('cancelOrder responde OrderNotFoundError si el pedido no existe', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([qr([]), qr([], 0), qr([])]));
      await expect(
        makeRepo(pool).cancelOrder(PEDIDO, C, undefined),
      ).rejects.toBeInstanceOf(OrderNotFoundError);
    });

    it('cancelOrder del vendedor con motivo válido marca cancelado_por vendedor', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr(
            [
              {
                id_pedido: PEDIDO,
                id_cliente: C,
                id_vendedor: V,
                estado: 'en_curso',
                id_jornada: J,
              },
            ],
            1,
          ),
          qr([{ id_producto: P1, cantidad: 2 }], 1),
          qr([], 1),
          qr([], 1),
          qr(
            [
              {
                ...PEDIDO_LIST_ROW,
                estado: 'cancelado',
                cancelado_por: 'vendedor',
                motivo_cancela: 'El cliente se fue',
              },
            ],
            1,
          ),
          qr([DETALLE_ROW], 1),
          qr([]),
        ]),
      );
      const pedido = await makeRepo(pool).cancelOrder(
        PEDIDO,
        V,
        'El cliente se fue',
      );
      expect(pedido.cancelado_por).toBe('vendedor');
    });

    it('cancelOrder del cliente falla si el pedido ya no es operativo', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([
          qr([]),
          qr(
            [
              {
                id_pedido: PEDIDO,
                id_cliente: C,
                id_vendedor: V,
                estado: 'completado',
                id_jornada: J,
              },
            ],
            1,
          ),
          qr([]),
        ]),
      );
      await expect(
        makeRepo(pool).cancelOrder(PEDIDO, C, undefined),
      ).rejects.toBeInstanceOf(InvalidOrderTransitionError);
    });

    it('expireTimedOutOrders devuelve lista vacía sin candidatos', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([qr([]), qr([], 0), qr([])]));
      const expirados = await makeRepo(pool).expireTimedOutOrders(50);
      expect(expirados).toEqual([]);
    });

    it('closeShiftAndCancelPendingOrders devuelve null si la jornada no existe', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([qr([]), qr([], 0), qr([])]));
      const result = await makeRepo(pool).closeShiftAndCancelPendingOrders(J, 'x');
      expect(result).toBeNull();
    });

    it('withTransaction preserva el error original si el ROLLBACK falla', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(
        sequence([new Error('begin fail'), new Error('rollback fail')]),
      );
      await expect(makeRepo(pool).createOrder(BASE_INPUT, 3)).rejects.toThrow(
        'begin fail',
      );
    });

    for (const code of ['40001', '40P01', '23503', '23505']) {
      it(`mapea el error Postgres ${code} a ConcurrentOperationError`, async () => {
        const { pool, client } = makeMocks();
        const pgError = Object.assign(new Error('pg'), { code });
        client.query.mockImplementation(
          sequence([qr([]), pgError, qr([])]),
        );
        await expect(
          makeRepo(pool).createOrder(BASE_INPUT, 3),
        ).rejects.toBeInstanceOf(ConcurrentOperationError);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      });
    }
  });

  describe('lecturas', () => {
    it('findPedidoById devuelve null sin filas', async () => {
      const { pool } = makeMocks();
      pool.query.mockResolvedValueOnce(qr([], 0));
      const pedido = await makeRepo(pool).findPedidoById(PEDIDO);
      expect(pedido).toBeNull();
    });

    it('findPedidoById devuelve pedido con líneas', async () => {
      const { pool } = makeMocks();
      pool.query.mockResolvedValueOnce(qr([PEDIDO_LIST_ROW], 1));
      pool.query.mockResolvedValueOnce(qr([DETALLE_ROW], 1));
      const pedido = await makeRepo(pool).findPedidoById(PEDIDO);
      expect(pedido?.lineas).toHaveLength(1);
      expect(pedido?.ubicacion_entrega).toEqual({
        type: 'Point',
        coordinates: [-57.5, -38.0],
      });
    });

    it('listOrders arma filtros de vendedor, estado y paginación', async () => {
      const { pool } = makeMocks();
      pool.query.mockResolvedValueOnce(
        qr([
          {
            id_pedido: PEDIDO,
            id_vendedor: V,
            id_cliente: C,
            estado: 'solicitado',
            total_orden: '2400.00',
            creado_el: new Date('2026-09-20T15:00:00Z'),
            expira_el: null,
            ubicacion_entrega: null,
            lineas_cantidad: 1,
          },
        ]),
      );
      const rows = await makeRepo(pool).listOrders({
        id_vendedor: V,
        estado: 'solicitado',
        limite: 20,
        offset: 0,
      });
      expect(rows[0]).toMatchObject({ id_pedido: PEDIDO, lineas_cantidad: 1 });
      const [sql, params] = pool.query.mock.calls[0];
      expect(String(sql)).toContain('p.id_vendedor = $1');
      expect(params).toEqual([V, 'solicitado', 20, 0]);
    });
  });
});
