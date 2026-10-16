import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { VendorRow, EstadoVendedor } from './entities/vendor-row.entity.js';
import { ParameterRow } from './entities/parameter-row.entity.js';
import { OrderRow } from './entities/order-row.entity.js';
import { ShiftRow } from './entities/shift-row.entity.js';

export class UserNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserNotFoundError';
  }
}

export class AlreadySuspendedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlreadySuspendedError';
  }
}

export class AlreadyBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlreadyBlockedError';
  }
}

export class InvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStateError';
  }
}

export class VendorNotRegisteredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VendorNotRegisteredError';
  }
}

export class StateChangedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateChangedError';
  }
}

export class ParameterNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParameterNotFoundError';
  }
}

@Injectable()
export class AdminRepository {
  constructor(@Inject('DATABASE_POOL') private readonly pool: Pool) {}

  private async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findVendors(
    page: number,
    limit: number,
    estado_vendedor?: string,
    q?: string,
  ): Promise<{ items: VendorRow[]; total: number }> {
    const offset = (page - 1) * limit;
    const params: any[] = [];
    const conditions: string[] = [];
    let paramIndex = 1;

    if (estado_vendedor) {
      params.push(estado_vendedor);
      conditions.push(`estado_vendedor = $${paramIndex++}`);
    }

    if (q) {
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      conditions.push(
        `(nombre_completo ILIKE $${paramIndex++} OR email ILIKE $${paramIndex++} OR dni ILIKE $${paramIndex++})`,
      );
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const countQuery = `SELECT COUNT(*) FROM usuarios${whereClause}`;
    const countResult = await this.pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const query = `SELECT * FROM usuarios${whereClause} ORDER BY creado_el DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    const result = await this.pool.query(query, params);

    return { items: result.rows, total };
  }

  async findVendorById(id: string): Promise<VendorRow | null> {
    const result = await this.pool.query('SELECT * FROM usuarios WHERE id_usuario = $1', [id]);
    return result.rows[0] || null;
  }

  async getCurrentStateForUpdate(client: PoolClient, idUsuario: string): Promise<EstadoVendedor> {
    const result = await client.query('SELECT estado_vendedor FROM usuarios WHERE id_usuario = $1 FOR UPDATE', [idUsuario]);
    if (result.rows.length === 0) {
      throw new UserNotFoundError('Usuario no encontrado');
    }
    return result.rows[0].estado_vendedor;
  }

  async suspendVendor(idUsuario: string, motivo: string, actorId: string): Promise<VendorRow> {
    return this.withTransaction(async (client) => {
      const currentState = await this.getCurrentStateForUpdate(client, idUsuario);

      if (currentState === 'no_solicitado') {
        throw new VendorNotRegisteredError('El usuario no es vendedor');
      }
      if (currentState === 'suspendido') {
        throw new AlreadySuspendedError('El vendedor ya está suspendido');
      }
      if (currentState === 'bloqueado') {
        throw new InvalidStateError('No se puede suspender un vendedor bloqueado');
      }

      const result = await client.query(
        'UPDATE usuarios SET estado_vendedor = $1, motivo_suspension = $2, ultima_revision_documental = now(), id_super_admin_revisor = $3 WHERE id_usuario = $4 RETURNING id_usuario, estado_vendedor, motivo_suspension',
        ['suspendido', motivo, actorId, idUsuario],
      );

      await client.query(
        'INSERT INTO auditoria_admin (actor_tipo, actor_id, accion, entidad_afectada, id_entidad, detalle) VALUES ($1, $2, $3, $4, $5, $6)',
        ['SUPER_ADMIN', actorId, 'suspender_vendedor', 'usuarios', idUsuario, motivo],
      );

      return result.rows[0];
    });
  }

  async approveVendor(idUsuario: string, motivo: string | undefined, actorId: string): Promise<VendorRow> {
    return this.withTransaction(async (client) => {
      const currentState = await this.getCurrentStateForUpdate(client, idUsuario);

      if (currentState !== 'pendiente_revision') {
        throw new InvalidStateError('Solo se puede aprobar desde pendiente de revisión');
      }

      const detalle = motivo || 'Documentación aprobada';
      const result = await client.query(
        'UPDATE usuarios SET estado_vendedor = $1, motivo_suspension = NULL, ultima_revision_documental = now(), id_super_admin_revisor = $2 WHERE id_usuario = $3 RETURNING id_usuario, estado_vendedor, motivo_suspension',
        ['activo', actorId, idUsuario],
      );

      await client.query(
        'INSERT INTO auditoria_admin (actor_tipo, actor_id, accion, entidad_afectada, id_entidad, detalle) VALUES ($1, $2, $3, $4, $5, $6)',
        ['SUPER_ADMIN', actorId, 'aprobar_documentacion', 'usuarios', idUsuario, detalle],
      );

      return result.rows[0];
    });
  }

  async rejectVendor(idUsuario: string, motivo: string, actorId: string): Promise<VendorRow> {
    return this.withTransaction(async (client) => {
      const currentState = await this.getCurrentStateForUpdate(client, idUsuario);

      if (currentState !== 'pendiente_revision') {
        throw new InvalidStateError('Solo se puede rechazar desde pendiente de revisión');
      }

      const result = await client.query(
        'UPDATE usuarios SET estado_vendedor = $1, motivo_suspension = $2, ultima_revision_documental = now(), id_super_admin_revisor = $3 WHERE id_usuario = $4 RETURNING id_usuario, estado_vendedor, motivo_suspension',
        ['suspendido', motivo, actorId, idUsuario],
      );

      await client.query(
        'INSERT INTO auditoria_admin (actor_tipo, actor_id, accion, entidad_afectada, id_entidad, detalle) VALUES ($1, $2, $3, $4, $5, $6)',
        ['SUPER_ADMIN', actorId, 'rechazar_documentacion', 'usuarios', idUsuario, motivo],
      );

      return result.rows[0];
    });
  }

  async blockVendor(idUsuario: string, motivo: string, actorId: string): Promise<VendorRow> {
    return this.withTransaction(async (client) => {
      const currentState = await this.getCurrentStateForUpdate(client, idUsuario);

      if (currentState === 'no_solicitado') {
        throw new VendorNotRegisteredError('El usuario no es vendedor');
      }
      if (currentState === 'bloqueado') {
        throw new AlreadyBlockedError('El vendedor ya está bloqueado');
      }

      const result = await client.query(
        'UPDATE usuarios SET estado_vendedor = $1, motivo_suspension = $2, ultima_revision_documental = now(), id_super_admin_revisor = $3 WHERE id_usuario = $4 RETURNING id_usuario, estado_vendedor, motivo_suspension',
        ['bloqueado', motivo, actorId, idUsuario],
      );

      await client.query(
        'INSERT INTO auditoria_admin (actor_tipo, actor_id, accion, entidad_afectada, id_entidad, detalle) VALUES ($1, $2, $3, $4, $5, $6)',
        ['SUPER_ADMIN', actorId, 'bloquear_usuario', 'usuarios', idUsuario, motivo],
      );

      return result.rows[0];
    });
  }

  async getParameters(): Promise<ParameterRow[]> {
    const result = await this.pool.query('SELECT * FROM parametros_sistema ORDER BY clave');
    return result.rows;
  }

  async updateParameter(clave: string, valor: string, actorId: string): Promise<ParameterRow> {
    return this.withTransaction(async (client) => {
      const currentResult = await client.query(
        'SELECT valor FROM parametros_sistema WHERE clave = $1 FOR UPDATE',
        [clave],
      );
      if (currentResult.rows.length === 0) {
        throw new ParameterNotFoundError('Parametro no encontrado');
      }
      const valorAnterior = currentResult.rows[0].valor;

      const result = await client.query(
        'UPDATE parametros_sistema SET valor = $1, actualizado_el = now() WHERE clave = $2 RETURNING *',
        [valor, clave],
      );

      const detalle = `Actualización de ${clave}: valor anterior ${valorAnterior} -> nuevo ${valor}`;
      await client.query(
        'INSERT INTO auditoria_admin (actor_tipo, actor_id, accion, entidad_afectada, id_entidad, detalle) VALUES ($1, $2, $3, $4, $5, $6)',
        ['SUPER_ADMIN', actorId, 'actualizar_parametro_sistema', 'parametros_sistema', clave, detalle],
      );
      return result.rows[0];
    });
  }

  async getOrders(
    page: number,
    limit: number,
    estado?: string,
    id_vendedor?: string,
    fecha_desde?: string,
    fecha_hasta?: string,
  ): Promise<{ items: OrderRow[]; total: number }> {
    const offset = (page - 1) * limit;
    const params: any[] = [];
    const conditions: string[] = [];
    let paramIndex = 1;

    if (estado) {
      params.push(estado);
      conditions.push(`estado = $${paramIndex++}`);
    }
    if (id_vendedor) {
      params.push(id_vendedor);
      conditions.push(`id_vendedor = $${paramIndex++}`);
    }
    if (fecha_desde) {
      params.push(fecha_desde);
      conditions.push(`creado_el >= $${paramIndex++}`);
    }
    if (fecha_hasta) {
      params.push(fecha_hasta);
      conditions.push(`creado_el <= $${paramIndex++}::timestamptz`);
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const countQuery = `SELECT COUNT(*) FROM pedidos${whereClause}`;
    const countResult = await this.pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const query = `SELECT * FROM pedidos${whereClause} ORDER BY creado_el DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    const result = await this.pool.query(query, params);

    return { items: result.rows, total };
  }

  async getShifts(
    page: number,
    limit: number,
    estado?: string,
    id_vendedor?: string,
    fecha_desde?: string,
    fecha_hasta?: string,
  ): Promise<{ items: ShiftRow[]; total: number }> {
    const offset = (page - 1) * limit;
    const params: any[] = [];
    const conditions: string[] = [];
    let paramIndex = 1;

    if (estado) {
      params.push(estado);
      conditions.push(`estado = $${paramIndex++}`);
    }
    if (id_vendedor) {
      params.push(id_vendedor);
      conditions.push(`id_vendedor = $${paramIndex++}`);
    }
    if (fecha_desde) {
      params.push(fecha_desde);
      conditions.push(`fecha_hora_inicio >= $${paramIndex++}::timestamptz`);
    }
    if (fecha_hasta) {
      params.push(fecha_hasta);
      conditions.push(`fecha_hora_inicio <= $${paramIndex++}::timestamptz`);
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const countQuery = `SELECT COUNT(*) FROM jornadas${whereClause}`;
    const countResult = await this.pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const query = `SELECT * FROM jornadas${whereClause} ORDER BY fecha_hora_inicio DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    const result = await this.pool.query(query, params);

    return { items: result.rows, total };
  }
}
