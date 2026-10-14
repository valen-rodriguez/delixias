import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service.js';
import {
  CancellationReasonRequiredError,
  ConcurrentOperationError,
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
import type { Pedido } from './orders.repository.js';
import type { AppConfiguration } from '../config/configuration.js';

const V = 'vendedor-1';
const C = 'cliente-1';

function makePedido(overrides: Partial<Pedido> = {}): Pedido {
  return {
    id_pedido: 'pedido-1',
    id_jornada: 'jornada-1',
    id_vendedor: V,
    id_cliente: C,
    id_medio_pago: 1,
    estado: 'solicitado',
    cancelado_por: null,
    motivo_cancela: null,
    ubicacion_entrega: { lat: -38.0, lng: -57.5 },
    total_orden: 2400,
    creado_el: new Date('2026-09-20T15:00:00Z'),
    expira_el: new Date('2026-09-20T15:03:00Z'),
    lineas: [
      {
        id_producto: 'p1',
        cantidad: 2,
        precio_historico: 1200,
        origen_tipo: 'autonomo',
        id_origen: V,
      },
    ],
    ...overrides,
  };
}

type MockedRepo = {
  createOrder: ReturnType<typeof vi.fn>;
  findPedidoById: ReturnType<typeof vi.fn>;
  listOrders: ReturnType<typeof vi.fn>;
  listActiveOrdersByVendor: ReturnType<typeof vi.fn>;
  acceptOrder: ReturnType<typeof vi.fn>;
  rejectOrder: ReturnType<typeof vi.fn>;
  completeOrder: ReturnType<typeof vi.fn>;
  cancelOrder: ReturnType<typeof vi.fn>;
  expireTimedOutOrders: ReturnType<typeof vi.fn>;
  closeShiftAndCancelPendingOrders: ReturnType<typeof vi.fn>;
};

describe('OrdersService', () => {
  let repo: MockedRepo;
  let eventEmitter: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    repo = {
      createOrder: vi.fn(),
      findPedidoById: vi.fn(),
      listOrders: vi.fn(),
      listActiveOrdersByVendor: vi.fn(),
      acceptOrder: vi.fn(),
      rejectOrder: vi.fn(),
      completeOrder: vi.fn(),
      cancelOrder: vi.fn(),
      expireTimedOutOrders: vi.fn(),
      closeShiftAndCancelPendingOrders: vi.fn(),
    };
    eventEmitter = { emit: vi.fn() };
  });

  function makeService(): OrdersService {
    const config = {
      get: vi.fn((key: string) =>
        key === 'orderTimeoutMinutes' ? 3 : undefined,
      ),
    } as unknown as ConfigService<AppConfiguration>;
    return new OrdersService(
      repo as unknown as OrdersRepository,
      eventEmitter as never,
      config,
    );
  }

  const createDto = {
    id_vendedor: V,
    id_medio_pago: 1,
    ubicacion_entrega: { lat: -38.0, lng: -57.5 },
    lineas: [{ id_producto: 'p1', cantidad: 2 }],
  };

  it('createOrder usa el timeout de config, emite order.created y mapea subtotales', async () => {
    repo.createOrder.mockResolvedValue(makePedido());
    const result = await makeService().createOrder(C, createDto);
    expect(repo.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id_cliente: C, id_vendedor: V }),
      3,
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith('order.created', {
      id_pedido: 'pedido-1',
      id_vendedor: V,
      id_jornada: 'jornada-1',
      expira_el: new Date('2026-09-20T15:03:00Z'),
    });
    expect(result.lineas[0].subtotal).toBe(2400);
    expect(result.ubicacion_compartida).toBe(true);
  });

  it('getOrder responde 404 ORDER_NOT_FOUND si no existe', async () => {
    repo.findPedidoById.mockResolvedValue(null);
    await expect(makeService().getOrder(C, 'nope')).rejects.toMatchObject({
      status: 404,
      response: { error: 'ORDER_NOT_FOUND' },
    });
  });

  it('getOrder oculta la ubicación al cliente', async () => {
    repo.findPedidoById.mockResolvedValue(makePedido());
    const result = await makeService().getOrder(C, 'pedido-1');
    expect(result.ubicacion_entrega).toBeNull();
    expect(result.ubicacion_compartida).toBe(false);
  });

  it('getOrder muestra la ubicación al vendedor mientras el pedido es operativo', async () => {
    repo.findPedidoById.mockResolvedValue(makePedido({ estado: 'en_curso' }));
    const result = await makeService().getOrder(V, 'pedido-1');
    expect(result.ubicacion_entrega).toEqual({ lat: -38.0, lng: -57.5 });
  });

  it('getOrder oculta la ubicación al vendedor si el pedido está completado', async () => {
    repo.findPedidoById.mockResolvedValue(makePedido({ estado: 'completado' }));
    const result = await makeService().getOrder(V, 'pedido-1');
    expect(result.ubicacion_entrega).toBeNull();
  });

  it('getOrder responde 404 para un actor ajeno', async () => {
    repo.findPedidoById.mockResolvedValue(makePedido());
    await expect(
      makeService().getOrder('intruso', 'pedido-1'),
    ).rejects.toMatchObject({
      status: 404,
      response: { error: 'ORDER_NOT_FOUND' },
    });
  });

  it('listOrders fusiona y deduplica los pedidos como cliente y vendedor', async () => {
    const row = {
      id_pedido: 'pedido-1',
      id_vendedor: V,
      id_cliente: C,
      estado: 'solicitado',
      total_orden: 2400,
      creado_el: new Date('2026-09-20T15:00:00Z'),
      expira_el: null,
      ubicacion_entrega: null,
      lineas_cantidad: 1,
    };
    repo.listOrders.mockResolvedValue([row]);
    const result = await makeService().listOrders(C, {});
    expect(repo.listOrders).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id_pedido: 'pedido-1', lineas_cantidad: 1 });
  });

  it('listActiveOrders calcula espera_segundos e incluye la ubicación', async () => {
    const creado = new Date(Date.now() - 30_000);
    repo.listActiveOrdersByVendor.mockResolvedValue([
      {
        id_pedido: 'pedido-1',
        id_vendedor: V,
        id_cliente: C,
        estado: 'solicitado',
        total_orden: 2400,
        creado_el: creado,
        expira_el: null,
        ubicacion_entrega: { lat: -38.0, lng: -57.5 },
        lineas_cantidad: 1,
      },
    ]);
    const result = await makeService().listActiveOrders(V);
    expect(result[0].espera_segundos).toBeGreaterThanOrEqual(29);
    expect(result[0].ubicacion_entrega).toEqual({ lat: -38.0, lng: -57.5 });
  });

  it('acceptOrder emite order.accepted', async () => {
    repo.acceptOrder.mockResolvedValue(makePedido({ estado: 'en_curso' }));
    await makeService().acceptOrder(V, 'pedido-1');
    expect(eventEmitter.emit).toHaveBeenCalledWith('order.accepted', {
      id_pedido: 'pedido-1',
      id_cliente: C,
      id_vendedor: V,
    });
  });

  it('rejectOrder emite order.rejected y order.revoked(ubicación)', async () => {
    repo.rejectOrder.mockResolvedValue(makePedido({ estado: 'rechazado' }));
    await makeService().rejectOrder(V, 'pedido-1');
    expect(eventEmitter.emit).toHaveBeenCalledWith('order.rejected', {
      id_pedido: 'pedido-1',
      id_cliente: C,
      id_vendedor: V,
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith('order.revoked', {
      id_pedido: 'pedido-1',
      motivo: 'rechazado',
    });
  });

  it('completeOrder emite order.completed y order.revoked(ubicación)', async () => {
    repo.completeOrder.mockResolvedValue(makePedido({ estado: 'completado' }));
    await makeService().completeOrder(V, 'pedido-1');
    expect(eventEmitter.emit).toHaveBeenCalledWith('order.completed', {
      id_pedido: 'pedido-1',
      id_cliente: C,
      id_vendedor: V,
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith('order.revoked', {
      id_pedido: 'pedido-1',
      motivo: 'completado',
    });
  });

  it('cancelOrder emite order.cancelled con cancelado_por y order.revoked', async () => {
    repo.cancelOrder.mockResolvedValue(
      makePedido({ estado: 'cancelado', cancelado_por: 'cliente' }),
    );
    await makeService().cancelOrder(C, 'pedido-1', undefined);
    expect(eventEmitter.emit).toHaveBeenCalledWith('order.cancelled', {
      id_pedido: 'pedido-1',
      cancelado_por: 'cliente',
      id_cliente: C,
      id_vendedor: V,
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith('order.revoked', {
      id_pedido: 'pedido-1',
      motivo: 'cancelado',
    });
  });

  it('expireTimedOutOrders emite order.expired + order.revoked por pedido y devuelve el total', async () => {
    repo.expireTimedOutOrders.mockResolvedValue([
      { id_pedido: 'pedido-1', id_cliente: C, id_vendedor: V },
      { id_pedido: 'pedido-2', id_cliente: C, id_vendedor: V },
    ]);
    const count = await makeService().expireTimedOutOrders();
    expect(count).toBe(2);
    expect(eventEmitter.emit).toHaveBeenCalledWith('order.expired', {
      id_pedido: 'pedido-1',
      id_cliente: C,
      id_vendedor: V,
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith('order.revoked', {
      id_pedido: 'pedido-1',
      motivo: 'cancelado',
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith('order.revoked', {
      id_pedido: 'pedido-2',
      motivo: 'cancelado',
    });
  });

  it('closeShiftAndCancelPendingOrders emite order.cancelled + order.revoked por pedido y shift.ended', async () => {
    repo.closeShiftAndCancelPendingOrders.mockResolvedValue({
      id_jornada: 'jornada-1',
      id_vendedor: V,
      cerrados: [{ id_pedido: 'pedido-1', id_cliente: C, id_vendedor: V }],
      yaFinalizada: false,
    });
    const result = await makeService().closeShiftAndCancelPendingOrders(
      'jornada-1',
      'auto',
    );
    expect(result?.cerrados).toHaveLength(1);
    expect(eventEmitter.emit).toHaveBeenCalledWith('order.cancelled', {
      id_pedido: 'pedido-1',
      cancelado_por: 'vendedor',
      id_cliente: C,
      id_vendedor: V,
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith('order.revoked', {
      id_pedido: 'pedido-1',
      motivo: 'cancelado',
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith('shift.ended', {
      id_jornada: 'jornada-1',
      id_vendedor: V,
    });
  });

  it('closeShiftAndCancelPendingOrders no emite nada si la jornada ya estaba finalizada', async () => {
    repo.closeShiftAndCancelPendingOrders.mockResolvedValue(null);
    await makeService().closeShiftAndCancelPendingOrders('jornada-1', 'auto');
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  describe('mapeo de errores de dominio', () => {
    const cases: Array<[Error, number, string]> = [
      [new NoActiveShiftError('x'), 409, 'JOURNEY_NOT_ACTIVE'],
      [new PaymentMethodNotAvailableError('x'), 409, 'PAYMENT_METHOD_NOT_AVAILABLE'],
      [new ProductNotAvailableError('x'), 409, 'PRODUCT_NOT_AVAILABLE'],
      [new ProductNotInShiftError('x'), 409, 'PRODUCT_NOT_IN_SHIFT'],
      [new InsufficientStockError('x'), 409, 'INSUFFICIENT_STOCK'],
      [new OrderNotFoundError('x'), 404, 'ORDER_NOT_FOUND'],
      [new InvalidOrderTransitionError('x'), 409, 'INVALID_ORDER_TRANSITION'],
      [new OrderExpiredError('x'), 409, 'ORDER_EXPIRED'],
      [new ConcurrentOperationError('x'), 409, 'CONCURRENT_OPERATION'],
      [new CancellationReasonRequiredError('x'), 400, 'CANCELLATION_REASON_REQUIRED'],
    ];

    for (const [error, status, code] of cases) {
      it(`${error.constructor.name} → ${status} ${code}`, async () => {
        repo.createOrder.mockRejectedValue(error);
        await expect(
          makeService().createOrder(C, createDto),
        ).rejects.toMatchObject({
          status,
          response: { error: code },
        });
        expect(eventEmitter.emit).not.toHaveBeenCalled();
      });
    }
  });

  it('re-lanza errores no mapeados', async () => {
    repo.createOrder.mockRejectedValue(new Error('db down'));
    await expect(
      makeService().createOrder(C, createDto),
    ).rejects.toThrow('db down');
  });
});
