import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool, PoolClient } from 'pg';
import { AdminRepository, ParameterNotFoundError, UserNotFoundError } from './admin.repository.js';

function createMockClient(overrides: Record<string, any> = {}): PoolClient {
  const base: any = {
    query: vi.fn(),
    release: vi.fn(),
  };
  return { ...base, ...overrides } as PoolClient;
}

function createMockPool(mockClient: PoolClient): Pool {
  return {
    connect: vi.fn().mockResolvedValue(mockClient),
    query: mockClient.query as any,
    end: vi.fn(),
  } as unknown as Pool;
}

describe('AdminRepository', () => {
  let pool: Pool;
  let client: any;
  let repo: AdminRepository;

  beforeEach(() => {
    client = createMockClient();
    pool = createMockPool(client);
    repo = new AdminRepository(pool);
  });

  describe('findVendors', () => {
    it('debe devolver lista paginada sin filtros', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [{ id_usuario: 'u1' }] });

      const result = await repo.findVendors(1, 10);

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(1);
    });

    it('debe filtrar por estado_vendedor y q', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id_usuario: 'u1' }] });

      const result = await repo.findVendors(1, 10, 'activo', 'juan');

      expect(result.total).toBe(1);
      expect(client.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('findVendorById', () => {
    it('debe devolver el vendedor si existe', async () => {
      client.query.mockResolvedValue({ rows: [{ id_usuario: 'u1', nombre_completo: 'Juan' }] });

      const result = await repo.findVendorById('u1');

      expect(result?.id_usuario).toBe('u1');
    });

    it('debe devolver null si no existe', async () => {
      client.query.mockResolvedValue({ rows: [] });

      const result = await repo.findVendorById('no-existe');

      expect(result).toBeNull();
    });
  });

  describe('getCurrentStateForUpdate', () => {
    it('debe devolver el estado actual con FOR UPDATE', async () => {
      client.query.mockResolvedValue({ rows: [{ estado_vendedor: 'activo' }] });

      const result = await repo.getCurrentStateForUpdate(client, 'u1');

      expect(result).toBe('activo');
      expect(client.query).toHaveBeenCalledWith(
        'SELECT estado_vendedor FROM usuarios WHERE id_usuario = $1 FOR UPDATE',
        ['u1'],
      );
    });

    it('debe lanzar UserNotFoundError si no existe', async () => {
      client.query.mockResolvedValue({ rows: [] });

      await expect(repo.getCurrentStateForUpdate(client, 'no-existe')).rejects.toBeInstanceOf(UserNotFoundError);
    });
  });

  describe('suspendVendor', () => {
    it('debe suspender y auditar en misma transacción', async () => {
      // Orden: BEGIN, SELECT FOR UPDATE, UPDATE RETURNING, INSERT auditoria, COMMIT
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ estado_vendedor: 'activo' }] }) // FOR UPDATE
        .mockResolvedValueOnce({ rows: [{ id_usuario: 'u1', estado_vendedor: 'suspendido', motivo_suspension: 'motivo' }] }) // UPDATE RETURNING
        .mockResolvedValueOnce({ rows: [] }) // INSERT auditoria
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await repo.suspendVendor('u1', 'motivo', 'actor-1');

      expect(result.estado_vendedor).toBe('suspendido');
      expect(result.motivo_suspension).toBe('motivo');
    });

    it('debe lanzar VendorNotRegisteredError si no_solicitado', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ estado_vendedor: 'no_solicitado' }] }); // FOR UPDATE

      await expect(repo.suspendVendor('u1', 'motivo', 'actor-1')).rejects.toThrow('El usuario no es vendedor');
      const rollbackCalls = client.query.mock.calls.filter((c: any[]) => c[0] === 'ROLLBACK');
      expect(rollbackCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('debe lanzar AlreadySuspendedError si ya suspendido', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ estado_vendedor: 'suspendido' }] }); // FOR UPDATE

      await expect(repo.suspendVendor('u1', 'motivo', 'actor-1')).rejects.toThrow('ya está suspendido');
    });

    it('debe hacer ROLLBACK si falla', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ estado_vendedor: 'activo' }] }) // FOR UPDATE
        .mockRejectedValueOnce(new Error('db error')); // UPDATE

      await expect(repo.suspendVendor('u1', 'motivo', 'actor-1')).rejects.toThrow('db error');
      const rollbackCalls = client.query.mock.calls.filter((c: any[]) => c[0] === 'ROLLBACK');
      expect(rollbackCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('approveVendor', () => {
    it('debe aprobar desde pendiente_revision', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ estado_vendedor: 'pendiente_revision' }] }) // FOR UPDATE
        .mockResolvedValueOnce({ rows: [{ id_usuario: 'u1', estado_vendedor: 'activo', motivo_suspension: null }] }) // UPDATE RETURNING
        .mockResolvedValueOnce({ rows: [] }) // INSERT auditoria
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await repo.approveVendor('u1', undefined, 'actor-1');

      expect(result.estado_vendedor).toBe('activo');
      expect(result.motivo_suspension).toBeNull();
    });

    it('debe lanzar InvalidStateError si no es pendiente_revision', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ estado_vendedor: 'activo' }] }); // FOR UPDATE

      await expect(repo.approveVendor('u1', undefined, 'actor-1')).rejects.toThrow('Solo se puede aprobar desde pendiente de revisión');
    });
  });

  describe('rejectVendor', () => {
    it('debe rechazar desde pendiente_revision con motivo', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ estado_vendedor: 'pendiente_revision' }] }) // FOR UPDATE
        .mockResolvedValueOnce({ rows: [{ id_usuario: 'u1', estado_vendedor: 'suspendido', motivo_suspension: 'docs invalidos' }] }) // UPDATE RETURNING
        .mockResolvedValueOnce({ rows: [] }) // INSERT auditoria
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await repo.rejectVendor('u1', 'docs invalidos', 'actor-1');

      expect(result.estado_vendedor).toBe('suspendido');
      expect(result.motivo_suspension).toBe('docs invalidos');
    });
  });

  describe('blockVendor', () => {
    it('debe bloquear y auditar', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ estado_vendedor: 'activo' }] }) // FOR UPDATE
        .mockResolvedValueOnce({ rows: [{ id_usuario: 'u1', estado_vendedor: 'bloqueado', motivo_suspension: 'fraude' }] }) // UPDATE RETURNING
        .mockResolvedValueOnce({ rows: [] }) // INSERT auditoria
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await repo.blockVendor('u1', 'fraude', 'actor-1');

      expect(result.estado_vendedor).toBe('bloqueado');
      expect(result.motivo_suspension).toBe('fraude');
    });

    it('debe lanzar AlreadyBlockedError si ya bloqueado', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ estado_vendedor: 'bloqueado' }] }); // FOR UPDATE

      await expect(repo.blockVendor('u1', 'fraude', 'actor-1')).rejects.toThrow('ya está bloqueado');
    });
  });

  describe('getParameters', () => {
    it('debe devolver lista de parámetros', async () => {
      client.query.mockResolvedValue({ rows: [{ clave: 'radio_cobertura_km', valor: '3' }] });

      const result = await repo.getParameters();

      expect(result).toHaveLength(1);
      expect(result[0].clave).toBe('radio_cobertura_km');
    });
  });

  describe('updateParameter', () => {
    it('debe capturar valor anterior y nuevo en auditoría', async () => {
      // Orden: BEGIN, SELECT FOR UPDATE (valor anterior), UPDATE RETURNING, INSERT auditoria, COMMIT
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ valor: '3' }] }) // SELECT FOR UPDATE valor anterior
        .mockResolvedValueOnce({ rows: [{ clave: 'radio_cobertura_km', valor: '5', actualizado_el: new Date() }] }) // UPDATE RETURNING
        .mockResolvedValueOnce({ rows: [] }) // INSERT auditoria
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await repo.updateParameter('radio_cobertura_km', '5', 'actor-1');

      expect(result.valor).toBe('5');
      // Verificar que el SELECT FOR UPDATE se ejecutó antes del UPDATE
      const calls = client.query.mock.calls.map((c: any[]) => c[0]);
      const selectIdx = calls.findIndex((c: string) => c.includes('SELECT valor FROM parametros_sistema WHERE clave = $1 FOR UPDATE'));
      const updateIdx = calls.findIndex((c: string) => c.includes('UPDATE parametros_sistema SET valor = $1'));
      expect(selectIdx).toBeGreaterThanOrEqual(0);
      expect(updateIdx).toBeGreaterThan(selectIdx);
    });

    it('debe lanzar ParameterNotFoundError si clave no existe', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // SELECT FOR UPDATE

      await expect(repo.updateParameter('inexistente', '5', 'actor-1')).rejects.toBeInstanceOf(ParameterNotFoundError);
    });

    it('debe hacer ROLLBACK si falla', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ valor: '3' }] }) // SELECT FOR UPDATE
        .mockRejectedValueOnce(new Error('db error')); // UPDATE

      await expect(repo.updateParameter('radio_cobertura_km', '5', 'actor-1')).rejects.toThrow('db error');
      const rollbackCalls = client.query.mock.calls.filter((c: any[]) => c[0] === 'ROLLBACK');
      expect(rollbackCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getOrders', () => {
    it('debe devolver pedidos paginados', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ id_pedido: 'p1' }] });

      const result = await repo.getOrders(1, 10);

      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getShifts', () => {
    it('debe devolver jornadas paginadas', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [{ id_jornada: 'j1' }] });

      const result = await repo.getShifts(1, 10);

      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(1);
    });
  });
});
