import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShiftsController } from './shifts.controller.js';
import { ShiftsModule } from './shifts.module.js';
import type { ShiftsService } from './shifts.service.js';
import type { AuthUser } from '../auth/strategies/supabase-jwt.strategy.js';
import type { StartShiftDto } from './dto/start-shift.dto.js';
import type { MermaDto } from './dto/merma.dto.js';

const USER: AuthUser = { id_usuario: 'u1', email: 'vendedor@delixias.com' };

const START_DTO: StartShiftDto = {
  lat: -38.0054771,
  lng: -57.5426106,
};

const MERMA_DTO: MermaDto = {
  id_producto: 'p1',
  cantidad: 3,
  motivo: 'Producto caído',
};

function makeRequest(): { user: AuthUser } {
  return { user: USER };
}

describe('ShiftsController', () => {
  let service: {
    getCurrentShift: ReturnType<typeof vi.fn>;
    startShift: ReturnType<typeof vi.fn>;
    endShift: ReturnType<typeof vi.fn>;
    registerMerma: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = {
      getCurrentShift: vi.fn(),
      startShift: vi.fn(),
      endShift: vi.fn(),
      registerMerma: vi.fn(),
    };
  });

  function makeController(): ShiftsController {
    return new ShiftsController(service as unknown as ShiftsService);
  }

  it('el módulo registra el controller', () => {
    expect(ShiftsModule).toBeDefined();
  });

  it('POST /shifts/end no recibe id: resuelve la jornada del vendedor', async () => {
    await makeController().endShift(makeRequest() as never);
    expect(service.endShift).toHaveBeenCalledWith('u1');
  });

  it('POST /shifts/start pasa vendedor y coordenadas', async () => {
    await makeController().startShift(makeRequest() as never, START_DTO);
    expect(service.startShift).toHaveBeenCalledWith('u1', START_DTO);
  });

  it('GET /shifts/current usa el id del usuario', async () => {
    await makeController().getCurrentShift(makeRequest() as never);
    expect(service.getCurrentShift).toHaveBeenCalledWith('u1');
  });

  it('POST /shifts/merma pasa vendedor, id_producto, cantidad y motivo', async () => {
    await makeController().registerMerma(makeRequest() as never, MERMA_DTO);
    expect(service.registerMerma).toHaveBeenCalledWith(
      'u1',
      'p1',
      3,
      'Producto caído',
    );
  });
});
