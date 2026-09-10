import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type {
  EstadoVendedor,
  RolOperativo,
  UserRow,
} from './entities/user.entity.js';

export class DuplicatedDniError extends Error {}
export class AlreadyActiveError extends Error {}
export class InvalidStateError extends Error {}
export class VendedorNotActiveError extends Error {}
export class UserNotFoundError extends Error {}

const PROFILE_SELECT = `
  SELECT id_usuario, email, nombre_completo, telefono, direccion, dni,
         foto_perfil_url, estado_vendedor, motivo_suspension,
         ultima_revision_documental, ultimo_rol_activo
  FROM public.usuarios
  WHERE id_usuario = $1
`;

function mapRow(row: Record<string, unknown>): UserRow {
  return {
    id_usuario: row.id_usuario as string,
    email: row.email as string,
    nombre_completo: row.nombre_completo as string,
    telefono: row.telefono as string,
    direccion: (row.direccion as string | null) ?? null,
    dni: (row.dni as string | null) ?? null,
    foto_perfil_url: (row.foto_perfil_url as string | null) ?? null,
    estado_vendedor: row.estado_vendedor as EstadoVendedor,
    motivo_suspension: (row.motivo_suspension as string | null) ?? null,
    ultima_revision_documental: row.ultima_revision_documental as Date | null,
    ultimo_rol_activo: row.ultimo_rol_activo as RolOperativo,
  };
}

@Injectable()
export class UsersRepository {
  constructor(@Inject('DATABASE_POOL') private readonly pool: Pool) {}

  async findById(idUsuario: string): Promise<UserRow | null> {
    const result = await this.pool.query(PROFILE_SELECT, [idUsuario]);
    return (result.rowCount ?? 0) > 0 ? mapRow(result.rows[0]) : null;
  }

  async upgradeToSeller(
    idUsuario: string,
    data: { dni: string; direccion: string; foto_perfil_url: string },
  ): Promise<void> {
    return this.withTransaction(async (client) => {
      const state = await this.getStateForUpdate(client, idUsuario);
      if (state !== 'no_solicitado') {
        throw new AlreadyActiveError(
          'El vendedor ya se encuentra activo o en otro estado; el alta solo es válida desde "no_solicitado".',
        );
      }

      try {
        await client.query(
          `UPDATE public.usuarios
             SET estado_vendedor = 'activo',
                 ultimo_rol_activo = 'vendedor',
                 dni = $2,
                 direccion = $3,
                 foto_perfil_url = $4
           WHERE id_usuario = $1`,
          [idUsuario, data.dni, data.direccion, data.foto_perfil_url],
        );
      } catch (error) {
        if (this.isUniqueViolationOn(error, 'usuarios_dni_key')) {
          throw new DuplicatedDniError(
            'El DNI ya se encuentra registrado para otro vendedor.',
          );
        }
        throw error;
      }
    });
  }

  async reappealDocumentation(
    idUsuario: string,
    nuevaFotoUrl: string,
  ): Promise<void> {
    return this.withTransaction(async (client) => {
      const state = await this.getStateForUpdate(client, idUsuario);
      if (state !== 'suspendido') {
        throw new InvalidStateError(
          'La apelación de documentación solo es válida desde "suspendido".',
        );
      }

      await client.query(
        `UPDATE public.usuarios
            SET estado_vendedor = 'pendiente_revision',
                foto_perfil_url = $2,
                ultima_revision_documental = NOW()
          WHERE id_usuario = $1`,
        [idUsuario, nuevaFotoUrl],
      );

      await client.query(
        `INSERT INTO public.auditoria_admin
           (actor_tipo, actor_id, accion, entidad_afectada, id_entidad, detalle)
         VALUES ('vendedor', $1, 'reappeal_documentacion', 'usuarios', $1, $2)`,
        [idUsuario, 'Reenvío de documentación para revisión'],
      );
    });
  }

  async switchRole(idUsuario: string, rol: RolOperativo): Promise<void> {
    return this.withTransaction(async (client) => {
      const state = await this.getStateForUpdate(client, idUsuario);
      if (rol === 'vendedor' && state !== 'activo') {
        throw new VendedorNotActiveError(
          'El modo vendedor no está habilitado: el estado del vendedor debe ser "activo".',
        );
      }

      await client.query(
        `UPDATE public.usuarios
            SET ultimo_rol_activo = $2
          WHERE id_usuario = $1`,
        [idUsuario, rol],
      );
    });
  }

  private async getStateForUpdate(
    client: PoolClient,
    idUsuario: string,
  ): Promise<EstadoVendedor> {
    const result = await client.query(
      `SELECT estado_vendedor
         FROM public.usuarios
        WHERE id_usuario = $1
        FOR UPDATE`,
      [idUsuario],
    );
    if (result.rowCount === 0) {
      throw new UserNotFoundError('Usuario no encontrado.');
    }
    return result.rows[0].estado_vendedor as EstadoVendedor;
  }

  private async withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
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

  private isUniqueViolationOn(error: unknown, constraint: string): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const code = (error as { code?: unknown }).code;
    const constrainName = (error as { constraint?: unknown }).constraint;
    return code === '23505' && constrainName === constraint;
  }
}
