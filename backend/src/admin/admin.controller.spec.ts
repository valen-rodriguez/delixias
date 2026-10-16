import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminController } from './admin.controller.js';

describe('AdminController', () => {
  let adminService: any;
  let controller: AdminController;

  beforeEach(() => {
    adminService = {
      getVendors: vi.fn(),
      getVendorById: vi.fn(),
      suspendVendor: vi.fn(),
      approveVendor: vi.fn(),
      rejectVendor: vi.fn(),
      blockVendor: vi.fn(),
      getParameters: vi.fn(),
      updateParameter: vi.fn(),
      getOrders: vi.fn(),
      getShifts: vi.fn(),
    };
    controller = new AdminController(adminService);
  });

  describe('GET /admin/vendors', () => {
    it('debe devolver listado paginado', async () => {
      adminService.getVendors.mockResolvedValue({ items: [], total: 0 });
      const result = await controller.getVendors({ page: 1, limit: 10 } as any);
      expect(adminService.getVendors).toHaveBeenCalledWith(1, 10, undefined, undefined);
      expect(result).toEqual({ items: [], total: 0 });
    });
  });

  describe('GET /admin/vendors/:id', () => {
    it('debe devolver detalle del vendedor', async () => {
      adminService.getVendorById.mockResolvedValue({ id_usuario: 'u1', nombre_completo: 'Juan' });
      const result = await controller.getVendorById({ id: 'u1' });
      expect(adminService.getVendorById).toHaveBeenCalledWith('u1');
      expect(result).toEqual({ id_usuario: 'u1', nombre_completo: 'Juan' });
    });
  });

  describe('PATCH /admin/vendors/:id/suspend', () => {
    it('debe retornar entidad actualizada', async () => {
      adminService.suspendVendor.mockResolvedValue({
        id_usuario: 'u1',
        estado_vendedor: 'suspendido',
        motivo_suspension: 'motivo',
      });

      const result = await controller.suspendVendor('u1', { motivo: 'motivo' } as any, { superAdmin: { id_super_admin: 'a1' } } as any);

      expect(adminService.suspendVendor).toHaveBeenCalledWith('u1', 'motivo', 'a1');
      expect(result).toEqual({
        id_usuario: 'u1',
        estado_vendedor: 'suspendido',
        motivo_suspension: 'motivo',
      });
    });
  });

  describe('PATCH /admin/vendors/:id/approve', () => {
    it('debe retornar entidad actualizada', async () => {
      adminService.approveVendor.mockResolvedValue({ id_usuario: 'u1', estado_vendedor: 'activo' });

      const result = await controller.approveVendor('u1', {} as any, { superAdmin: { id_super_admin: 'a1' } } as any);

      expect(result).toEqual({ id_usuario: 'u1', estado_vendedor: 'activo' });
    });
  });

  describe('PATCH /admin/vendors/:id/reject', () => {
    it('debe retornar entidad actualizada', async () => {
      adminService.rejectVendor.mockResolvedValue({
        id_usuario: 'u1',
        estado_vendedor: 'suspendido',
        motivo_suspension: 'docs invalidos',
      });

      const result = await controller.rejectVendor('u1', { motivo: 'docs invalidos' } as any, { superAdmin: { id_super_admin: 'a1' } } as any);

      expect(result).toEqual({
        id_usuario: 'u1',
        estado_vendedor: 'suspendido',
        motivo_suspension: 'docs invalidos',
      });
    });
  });

  describe('PATCH /admin/vendors/:id/block', () => {
    it('debe retornar entidad actualizada', async () => {
      adminService.blockVendor.mockResolvedValue({
        id_usuario: 'u1',
        estado_vendedor: 'bloqueado',
        motivo_suspension: 'fraude',
      });

      const result = await controller.blockVendor('u1', { motivo: 'fraude' } as any, { superAdmin: { id_super_admin: 'a1' } } as any);

      expect(result).toEqual({
        id_usuario: 'u1',
        estado_vendedor: 'bloqueado',
        motivo_suspension: 'fraude',
      });
    });
  });

  describe('GET /admin/parameters', () => {
    it('debe devolver lista de parámetros', async () => {
      adminService.getParameters.mockResolvedValue([{ clave: 'radio_cobertura_km', valor: '3' }]);
      const result = await controller.getParameters();
      expect(result).toEqual([{ clave: 'radio_cobertura_km', valor: '3' }]);
    });
  });

  describe('PATCH /admin/parameters/:clave', () => {
    it('debe retornar el parámetro actualizado', async () => {
      adminService.updateParameter.mockResolvedValue({ clave: 'radio_cobertura_km', valor: '5' });

      const result = await controller.updateParameter(
        { clave: 'radio_cobertura_km' } as any,
        { valor: '5' } as any,
        { superAdmin: { id_super_admin: 'a1' } } as any,
      );

      expect(adminService.updateParameter).toHaveBeenCalledWith('radio_cobertura_km', '5', 'a1');
      expect(result).toEqual({ clave: 'radio_cobertura_km', valor: '5' });
    });
  });

  describe('GET /admin/orders y /admin/shifts', () => {
    it('debe delegar getOrders', async () => {
      adminService.getOrders.mockResolvedValue({ items: [], total: 0 });
      const result = await controller.getOrders({ page: 1, limit: 10 } as any);
      expect(adminService.getOrders).toHaveBeenCalledWith(1, 10, undefined, undefined, undefined, undefined);
      expect(result).toEqual({ items: [], total: 0 });
    });

    it('debe delegar getShifts', async () => {
      adminService.getShifts.mockResolvedValue({ items: [], total: 0 });
      const result = await controller.getShifts({ page: 1, limit: 10 } as any);
      expect(adminService.getShifts).toHaveBeenCalledWith(1, 10, undefined, undefined, undefined, undefined);
      expect(result).toEqual({ items: [], total: 0 });
    });
  });
});
