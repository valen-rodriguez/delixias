import { vi } from 'vitest';
import { ShiftsService } from './shifts.service.js';
import type { ShiftsRepository } from './shifts.repository.js';
import {
  NoActiveShiftError,
  NoStockAvailableError,
  ShiftAlreadyActiveError,
  ShiftHasPendingOrdersError,
  VendedorNotActiveError,
} from './shifts.repository.js';
import type { CurrentShiftResponse } from './entities/jornada.entity.js';

const currentShift: CurrentShiftResponse = {
  id_jornada: '521d1c58-9c4e-4af7-9f95-1e6f1c0e9a4a',
  id_vendedor: 'vendedor-uuid',
  estado: 'ACTIVA',
  fecha_hora_inicio: '2026-03-15T14:30:00.000Z',
  coordenada_inicio: { lat: -38.0054771, lng: -57.5426106 },
  stock_inicial_consolidado: {
    fecha_snapshot: '2026-03-15T14:30:00.000Z',
    total_unidades: 10,
    items: [
      {
        id_producto: 'c6b1d8f4-1e2b-4c4a-8b5a-2f3a4b5c6d7e',
        nombre: 'Empanada a caballo',
        precio_unitario: 2100,
        cantidad_inicial: 10,
      },
    ],
  },
  inventario: [
    {
      id_producto: 'c6b1d8f4-1e2b-4c4a-8b5a-2f3a4b5c6d7e',
      nombre: 'Empanada a caballo',
      precio_unitario: 2100,
      foto_url: null,
      stock_inicial: 10,
      stock_actual: 10,
    },
  ],
};

const closedShift: CurrentShiftResponse = {
  ...currentShift,
  estado: 'FINALIZADA',
  fecha_hora_fin: '2026-03-15T20:30:00.000Z',
};

type MockedRepo = {
  [K in keyof ShiftsRepository]: ReturnType<typeof vi.fn>;
};

describe('ShiftsService', () => {
  let repo: MockedRepo;

  beforeEach(() => {
    repo = {
      findCurrentShift: vi.fn(),
      startShift: vi.fn(),
      endShift: vi.fn(),
    };
  });

  function makeService(): ShiftsService {
    return new ShiftsService(repo as unknown as ShiftsRepository);
  }

  const startPayload = {
    lat: -38.0054771,
    lng: -57.5426106,
  };

  it('getCurrentShift devuelve null sin jornada activa', async () => {
    repo.findCurrentShift.mockResolvedValue(null);
    const result = await makeService().getCurrentShift('vendedor-uuid');
    expect(result).toBeNull();
  });

  it('getCurrentShift devuelve la jornada activa con el shape completo del spec', async () => {
    repo.findCurrentShift.mockResolvedValue(currentShift);
    const result = await makeService().getCurrentShift('vendedor-uuid');
    expect(result).toMatchObject({
      id_jornada: currentShift.id_jornada,
      id_vendedor: 'vendedor-uuid',
      estado: 'ACTIVA',
      stock_inicial_consolidado: {
        total_unidades: 10,
        items: [
          {
            id_producto: 'c6b1d8f4-1e2b-4c4a-8b5a-2f3a4b5c6d7e',
            cantidad_inicial: 10,
          },
        ],
      },
      inventario: [
        {
          id_producto: 'c6b1d8f4-1e2b-4c4a-8b5a-2f3a4b5c6d7e',
          stock_inicial: 10,
          stock_actual: 10,
        },
      ],
    });
  });

  it('startShift devuelve la jornada recién abierta', async () => {
    repo.startShift.mockResolvedValue(currentShift);
    const result = await makeService().startShift(
      'vendedor-uuid',
      startPayload,
    );
    expect(result).toMatchObject({
      id_vendedor: 'vendedor-uuid',
      estado: 'ACTIVA',
      coordenada_inicio: { lat: -38.0054771, lng: -57.5426106 },
    });
  });

  it('startShift con vendedor no activo responde 403 VENDOR_NOT_ACTIVE', async () => {
    repo.startShift.mockRejectedValue(
      new VendedorNotActiveError('no activo'),
    );
    await expect(
      makeService().startShift('vendedor-uuid', startPayload),
    ).rejects.toMatchObject({
      status: 403,
      response: { error: 'VENDOR_NOT_ACTIVE' },
    });
  });

  it('startShift sin mercadería responde 400 NO_STOCK_AVAILABLE', async () => {
    repo.startShift.mockRejectedValue(
      new NoStockAvailableError('sin mercadería'),
    );
    await expect(
      makeService().startShift('vendedor-uuid', startPayload),
    ).rejects.toMatchObject({
      status: 400,
      response: { error: 'NO_STOCK_AVAILABLE' },
    });
  });

  it('startShift con jornada ya activa responde 409 SHIFT_ALREADY_ACTIVE', async () => {
    repo.startShift.mockRejectedValue(
      new ShiftAlreadyActiveError('ya activa'),
    );
    await expect(
      makeService().startShift('vendedor-uuid', startPayload),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'SHIFT_ALREADY_ACTIVE' },
    });
  });

  it('endShift finaliza la jornada con fecha_hora_fin', async () => {
    repo.endShift.mockResolvedValue(closedShift);
    const result = await makeService().endShift('vendedor-uuid');
    expect(repo.endShift).toHaveBeenCalledWith('vendedor-uuid');
    expect(result).toMatchObject({
      estado: 'FINALIZADA',
      fecha_hora_fin: '2026-03-15T20:30:00.000Z',
    });
  });

  it('endShift con pedidos pendientes responde 409 SHIFT_HAS_PENDING_ORDERS', async () => {
    repo.endShift.mockRejectedValue(
      new ShiftHasPendingOrdersError('tiene pendientes'),
    );
    await expect(
      makeService().endShift('vendedor-uuid'),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'SHIFT_HAS_PENDING_ORDERS' },
    });
  });

  it('endShift sin jornada activa responde 409 NO_ACTIVE_SHIFT', async () => {
    repo.endShift.mockRejectedValue(new NoActiveShiftError('no hay jornada'));
    await expect(
      makeService().endShift('vendedor-uuid'),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'NO_ACTIVE_SHIFT' },
    });
  });

  it('startShift re-lanza errores no mapeados', async () => {
    repo.startShift.mockRejectedValue(new Error('db down'));
    await expect(
      makeService().startShift('vendedor-uuid', startPayload),
    ).rejects.toThrow('db down');
  });

  it('endShift re-lanza errores no mapeados', async () => {
    repo.endShift.mockRejectedValue(new Error('db down'));
    await expect(
      makeService().endShift('vendedor-uuid'),
    ).rejects.toThrow('db down');
  });
});