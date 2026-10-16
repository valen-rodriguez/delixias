import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersController } from './orders.controller.js';
import { OrdersModule } from './orders.module.js';
import type { OrdersService } from './orders.service.js';
import type { AuthUser } from '../auth/strategies/supabase-jwt.strategy.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';

const USER: AuthUser = { id_usuario: 'u1', email: 'cliente@delixias.com' };
const ID = '9b1c1e2a-3f4b-4c5d-8e6f-7a8b9c0d1e2f';

const CREATE_DTO: CreateOrderDto = {
  id_vendedor: '11111111-1111-4111-8111-111111111111',
  id_medio_pago: 1,
  ubicacion_entrega: { lat: -38.0054771, lng: -57.5426106 },
  lineas: [
    {
      id_producto: '22222222-2222-4222-8222-222222222222',
      cantidad: 2,
    },
  ],
};

function makeRequest(): { user: AuthUser } {
  return { user: USER };
}

describe('OrdersController', () => {
  let service: {
    createOrder: ReturnType<typeof vi.fn>;
    getOrder: ReturnType<typeof vi.fn>;
    listOrders: ReturnType<typeof vi.fn>;
    listActiveOrders: ReturnType<typeof vi.fn>;
    acceptOrder: ReturnType<typeof vi.fn>;
    rejectOrder: ReturnType<typeof vi.fn>;
    completeOrder: ReturnType<typeof vi.fn>;
    cancelOrder: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = {
      createOrder: vi.fn(),
      getOrder: vi.fn(),
      listOrders: vi.fn(),
      listActiveOrders: vi.fn(),
      acceptOrder: vi.fn(),
      rejectOrder: vi.fn(),
      completeOrder: vi.fn(),
      cancelOrder: vi.fn(),
    };
  });

  function makeController(): OrdersController {
    return new OrdersController(service as unknown as OrdersService);
  }

  it('el módulo registra el controller', () => {
    expect(OrdersModule).toBeDefined();
  });

  it('POST /orders crea con el cliente del JWT', async () => {
    await makeController().createOrder(makeRequest() as never, CREATE_DTO);
    expect(service.createOrder).toHaveBeenCalledWith('u1', CREATE_DTO);
  });

  it('GET /orders/:id usa el actor del JWT', async () => {
    await makeController().getOrder(makeRequest() as never, ID);
    expect(service.getOrder).toHaveBeenCalledWith('u1', ID);
  });

  it('GET /orders pasa filtros de query', async () => {
    await makeController().listOrders(makeRequest() as never, { page: 1 });
    expect(service.listOrders).toHaveBeenCalledWith('u1', { page: 1 });
  });

  it('GET /orders/vendor/active usa el vendedor del JWT', async () => {
    await makeController().listActiveOrders(makeRequest() as never);
    expect(service.listActiveOrders).toHaveBeenCalledWith('u1');
  });

  it('POST /orders/:id/accept usa el vendedor del JWT', async () => {
    await makeController().acceptOrder(makeRequest() as never, ID);
    expect(service.acceptOrder).toHaveBeenCalledWith('u1', ID);
  });

  it('POST /orders/:id/reject usa el vendedor del JWT', async () => {
    await makeController().rejectOrder(makeRequest() as never, ID, { motivo: 'no disponible' });
    expect(service.rejectOrder).toHaveBeenCalledWith('u1', ID);
  });

  it('POST /orders/:id/complete usa el vendedor del JWT', async () => {
    await makeController().completeOrder(makeRequest() as never, ID);
    expect(service.completeOrder).toHaveBeenCalledWith('u1', ID);
  });

  it('POST /orders/:id/cancel deduce el actor del JWT y pasa el motivo', async () => {
    await makeController().cancelOrder(makeRequest() as never, ID, {
      motivo: 'El cliente se fue',
    });
    expect(service.cancelOrder).toHaveBeenCalledWith(
      'u1',
      ID,
      'El cliente se fue',
    );
  });
});
