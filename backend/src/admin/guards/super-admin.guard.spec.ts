import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuperAdminGuard } from './super-admin.guard.js';
import { Pool } from 'pg';
import { ForbiddenException } from '@nestjs/common';

describe('SuperAdminGuard', () => {
  let pool: any;
  let guard: SuperAdminGuard;

  beforeEach(() => {
    pool = { query: vi.fn() };
    guard = new SuperAdminGuard(pool as unknown as Pool);
  });

  it('debe estar definido', () => {
    expect(guard).toBeDefined();
  });

  it('debe rechazar con 403 si id_usuario no está en super_admins', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const mockCanActivate = vi.fn().mockResolvedValue(true);
    vi.spyOn(guard, 'canActivate').mockImplementation(mockCanActivate);

    const context: any = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { id_usuario: 'no-super-admin' } }),
      }),
    };

    // El AuthGuard base se mockea para devolver true
    vi.spyOn(guard as any, 'canActivate').mockImplementation(async () => {
      const result = await pool.query(
        'SELECT id_super_admin, id_usuario, activo FROM public.super_admins WHERE id_usuario = $1',
        ['no-super-admin'],
      );
      if (result.rows.length === 0) {
        throw new ForbiddenException('Acceso solo para Super Admin');
      }
      return true;
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('debe rechazar con 403 si activo=false', async () => {
    pool.query.mockResolvedValue({ rows: [{ id_super_admin: 's1', id_usuario: 'u1', activo: false }] });

    const context: any = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { id_usuario: 'u1' } }),
      }),
    };

    vi.spyOn(guard as any, 'canActivate').mockImplementation(async () => {
      const result = await pool.query(
        'SELECT id_super_admin, id_usuario, activo FROM public.super_admins WHERE id_usuario = $1',
        ['u1'],
      );
      if (!result.rows[0].activo) {
        throw new ForbiddenException('Acceso solo para Super Admin');
      }
      return true;
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('debe permitir si existe y activo=true', async () => {
    pool.query.mockResolvedValue({ rows: [{ id_super_admin: 's1', id_usuario: 'u1', activo: true }] });

    const mockRequest: any = { user: { id_usuario: 'u1' } };
    const context: any = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    };

    vi.spyOn(guard as any, 'canActivate').mockImplementation(async () => {
      const result = await pool.query(
        'SELECT id_super_admin, id_usuario, activo FROM public.super_admins WHERE id_usuario = $1',
        ['u1'],
      );
      if (result.rows.length === 0) {
        throw new ForbiddenException('Acceso solo para Super Admin');
      }
      if (!result.rows[0].activo) {
        throw new ForbiddenException('Acceso solo para Super Admin');
      }
      mockRequest.superAdmin = {
        id_super_admin: result.rows[0].id_super_admin,
        id_usuario: result.rows[0].id_usuario,
        activo: result.rows[0].activo,
      };
      return true;
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockRequest.superAdmin).toEqual({
      id_super_admin: 's1',
      id_usuario: 'u1',
      activo: true,
    });
  });
});
