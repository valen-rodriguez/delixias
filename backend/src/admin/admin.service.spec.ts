import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminService } from './admin.service.js';
import {
  ParameterNotFoundError,
  UserNotFoundError,
  VendorNotRegisteredError,
  AlreadySuspendedError,
  AlreadyBlockedError,
  InvalidStateError,
} from './admin.repository.js';

describe('AdminService', () => {
  let adminRepo: any;
  let shiftsRepo: any;
  let ordersService: any;
  let redisGeo: any;
  let eventEmitter: any;
  let service: AdminService;

  beforeEach(() => {
    adminRepo = {
      findVendors: vi.fn(),
      findVendorById: vi.fn(),
      suspendVendor: vi.fn(),
      approveVendor: vi.fn(),
      rejectVendor: vi.fn(),
      blockVendor: vi.fn(),
      getParameters: vi.fn(),
      updateParameter: vi.fn(),
      getOrders: vi.fn(),
      getShifts: vi.fn(),
    };
    shiftsRepo = { findCurrentShift: vi.fn() };
    ordersService = { closeShiftAndCancelPendingOrders: vi.fn() };
    redisGeo = { set: vi.fn() };
    eventEmitter = { emit: vi.fn() };

    service = new AdminService(adminRepo, shiftsRepo, ordersService, redisGeo, eventEmitter);
  });

  describe('getVendors', () => {
    it('debe delegar al repository', async () => {
      adminRepo.findVendors.mockResolvedValue({ items: [], total: 0 });
      const result = await service.getVendors(1, 10, 'activo', 'juan');
      expect(adminRepo.findVendors).toHaveBeenCalledWith(1, 10, 'activo', 'juan');
      expect(result).toEqual({ items: [], total: 0 });
    });
  });

  describe('getVendorById', () => {
    it('debe devolver el vendedor', async () => {
      adminRepo.findVendorById.mockResolvedValue({ id_usuario: 'u1' });
      const result = await service.getVendorById('u1');
      expect(result).toEqual({ id_usuario: 'u1' });
    });

    it('debe lanzar 404 si no existe', async () => {
      adminRepo.findVendorById.mockResolvedValue(null);
      await expect(service.getVendorById('no-existe')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('suspendVendor', () => {
    it('debe cerrar jornada y suspender', async () => {
      shiftsRepo.findCurrentShift.mockResolvedValue({ id_jornada: 'j1' });
      ordersService.closeShiftAndCancelPendingOrders.mockResolvedValue({});
      adminRepo.suspendVendor.mockResolvedValue({
        id_usuario: 'u1',
        estado_vendedor: 'suspendido',
        motivo_suspension: 'motivo',
      });

      const result = await service.suspendVendor('u1', 'motivo', 'actor-1');

      expect(ordersService.closeShiftAndCancelPendingOrders).toHaveBeenCalledWith('j1', 'motivo');
      expect(adminRepo.suspendVendor).toHaveBeenCalledWith('u1', 'motivo', 'actor-1');
      expect(result).toEqual({
        id_usuario: 'u1',
        estado_vendedor: 'suspendido',
        motivo_suspension: 'motivo',
      });
    });

    it('no debe llamar a closeShiftAndCancelPendingOrders si no hay jornada', async () => {
      shiftsRepo.findCurrentShift.mockResolvedValue(null);
      adminRepo.suspendVendor.mockResolvedValue({
        id_usuario: 'u1',
        estado_vendedor: 'suspendido',
        motivo_suspension: 'motivo',
      });

      await service.suspendVendor('u1', 'motivo', 'actor-1');
      expect(ordersService.closeShiftAndCancelPendingOrders).not.toHaveBeenCalled();
    });

    it('debe mapear UserNotFoundError a 404', async () => {
      adminRepo.suspendVendor.mockRejectedValue(new UserNotFoundError('no encontrado'));
      await expect(service.suspendVendor('u1', 'motivo', 'actor-1')).rejects.toMatchObject({ status: 404 });
    });

    it('debe mapear VendorNotRegisteredError a 409', async () => {
      adminRepo.suspendVendor.mockRejectedValue(new VendorNotRegisteredError('no es vendedor'));
      await expect(service.suspendVendor('u1', 'motivo', 'actor-1')).rejects.toMatchObject({ status: 409 });
    });

    it('debe mapear AlreadySuspendedError a 409', async () => {
      adminRepo.suspendVendor.mockRejectedValue(new AlreadySuspendedError('ya suspendido'));
      await expect(service.suspendVendor('u1', 'motivo', 'actor-1')).rejects.toMatchObject({ status: 409 });
    });

    it('debe mapear InvalidStateError a 409', async () => {
      adminRepo.suspendVendor.mockRejectedValue(new InvalidStateError('estado invalido'));
      await expect(service.suspendVendor('u1', 'motivo', 'actor-1')).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('approveVendor', () => {
    it('debe aprobar y retornar entidad', async () => {
      adminRepo.approveVendor.mockResolvedValue({
        id_usuario: 'u1',
        estado_vendedor: 'activo',
      });

      const result = await service.approveVendor('u1', undefined, 'actor-1');

      expect(adminRepo.approveVendor).toHaveBeenCalledWith('u1', undefined, 'actor-1');
      expect(result).toEqual({ id_usuario: 'u1', estado_vendedor: 'activo' });
    });

    it('debe mapear InvalidStateError a 409', async () => {
      adminRepo.approveVendor.mockRejectedValue(new InvalidStateError('no es pendiente'));
      await expect(service.approveVendor('u1', undefined, 'actor-1')).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('rejectVendor', () => {
    it('debe rechazar y retornar entidad', async () => {
      adminRepo.rejectVendor.mockResolvedValue({
        id_usuario: 'u1',
        estado_vendedor: 'suspendido',
        motivo_suspension: 'docs invalidos',
      });

      const result = await service.rejectVendor('u1', 'docs invalidos', 'actor-1');

      expect(result).toEqual({
        id_usuario: 'u1',
        estado_vendedor: 'suspendido',
        motivo_suspension: 'docs invalidos',
      });
    });

    it('debe mapear InvalidStateError a 409', async () => {
      adminRepo.rejectVendor.mockRejectedValue(new InvalidStateError('no es pendiente'));
      await expect(service.rejectVendor('u1', 'motivo', 'actor-1')).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('blockVendor', () => {
    it('debe cerrar jornada y bloquear', async () => {
      shiftsRepo.findCurrentShift.mockResolvedValue({ id_jornada: 'j1' });
      ordersService.closeShiftAndCancelPendingOrders.mockResolvedValue({});
      adminRepo.blockVendor.mockResolvedValue({
        id_usuario: 'u1',
        estado_vendedor: 'bloqueado',
        motivo_suspension: 'fraude',
      });

      const result = await service.blockVendor('u1', 'fraude', 'actor-1');

      expect(result).toEqual({
        id_usuario: 'u1',
        estado_vendedor: 'bloqueado',
        motivo_suspension: 'fraude',
      });
    });

    it('debe mapear AlreadyBlockedError a 409', async () => {
      adminRepo.blockVendor.mockRejectedValue(new AlreadyBlockedError('ya bloqueado'));
      await expect(service.blockVendor('u1', 'motivo', 'actor-1')).rejects.toMatchObject({ status: 409 });
    });

    it('debe mapear VendorNotRegisteredError a 409', async () => {
      adminRepo.blockVendor.mockRejectedValue(new VendorNotRegisteredError('no es vendedor'));
      await expect(service.blockVendor('u1', 'motivo', 'actor-1')).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('getParameters', () => {
    it('debe delegar al repository', async () => {
      adminRepo.getParameters.mockResolvedValue([{ clave: 'radio_cobertura_km', valor: '3' }]);
      const result = await service.getParameters();
      expect(result).toEqual([{ clave: 'radio_cobertura_km', valor: '3' }]);
    });
  });

  describe('updateParameter', () => {
    it('debe actualizar y sincronizar en Redis', async () => {
      adminRepo.updateParameter.mockResolvedValue({
        clave: 'radio_cobertura_km',
        valor: '5',
      });

      const result = await service.updateParameter('radio_cobertura_km', '5', 'actor-1');

      expect(redisGeo.set).toHaveBeenCalledWith('param:radio_cobertura_km', '5');
      expect(result).toEqual({ clave: 'radio_cobertura_km', valor: '5' });
    });

    it('debe rechazar valor no numérico para clave numérica', async () => {
      await expect(service.updateParameter('radio_cobertura_km', 'abc', 'actor-1')).rejects.toMatchObject({
        status: 400,
        response: {
          error: 'VALIDATION_ERROR',
          message: 'El valor debe ser un número mayor a 0.',
        },
      });
    });

    it('debe rechazar valor <= 0 para clave numérica', async () => {
      await expect(service.updateParameter('radio_cobertura_km', '0', 'actor-1')).rejects.toMatchObject({
        status: 400,
        response: {
          error: 'VALIDATION_ERROR',
          message: 'El valor debe ser un número mayor a 0.',
        },
      });
    });

    it('debe mapear ParameterNotFoundError a 404', async () => {
      adminRepo.updateParameter.mockRejectedValue(new ParameterNotFoundError('no existe'));
      await expect(service.updateParameter('inexistente', '5', 'actor-1')).rejects.toMatchObject({ status: 404 });
    });

    it('debe permitir valor numérico válido para clave numérica', async () => {
      adminRepo.updateParameter.mockResolvedValue({ clave: 'radio_cobertura_km', valor: '5' });
      await service.updateParameter('radio_cobertura_km', '5', 'actor-1');
      expect(adminRepo.updateParameter).toHaveBeenCalledWith('radio_cobertura_km', '5', 'actor-1');
    });
  });

  describe('getOrders y getShifts', () => {
    it('debe delegar getOrders al repository', async () => {
      adminRepo.getOrders.mockResolvedValue({ items: [], total: 0 });
      const result = await service.getOrders(1, 10);
      expect(adminRepo.getOrders).toHaveBeenCalledWith(1, 10, undefined, undefined, undefined, undefined);
      expect(result).toEqual({ items: [], total: 0 });
    });

    it('debe delegar getShifts al repository', async () => {
      adminRepo.getShifts.mockResolvedValue({ items: [], total: 0 });
      const result = await service.getShifts(1, 10);
      expect(adminRepo.getShifts).toHaveBeenCalledWith(1, 10, undefined, undefined, undefined, undefined);
      expect(result).toEqual({ items: [], total: 0 });
    });
  });
});
