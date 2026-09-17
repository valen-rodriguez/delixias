import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient, QueryResult } from 'pg';
import type { StartShiftDto } from './dto/start-shift.dto.js';
import type {
  CurrentShiftResponse,
  InventarioItem,
  JornadaEstado,
  JornadaRow,
  MermaResponse,
  SnapshotItem,
} from './entities/jornada.entity.js';

export class VendedorNotActiveError extends Error {}
export class NoStockAvailableError extends Error {}
export class ShiftAlreadyActiveError extends Error {}
export class NoActiveShiftError extends Error {}
export class ShiftHasPendingOrdersError extends Error {}
export class MermaExceedsStockError extends Error {}
export class ProductNotInJornadaError extends Error {}

interface QueryRunner {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
}

function parseCoordenadaInicio(value: unknown): { lat: number; lng: number } {
  const v = value as Record<string, unknown>;
  if (
    v &&
    typeof v === 'object' &&
    v.type === 'Point' &&
    Array.isArray(v.coordinates) &&
    v.coordinates.length >= 2
  ) {
    return { lat: Number(v.coordinates[1]), lng: Number(v.coordinates[0]) };
  }
  return value as { lat: number; lng: number };
}

function mapJornadaRow(row: Record<string, unknown>): JornadaRow {
  return {
    id_jornada: row.id_jornada as string,
    id_vendedor: row.id_vendedor as string,
    estado: row.estado as JornadaEstado,
    fecha_hora_inicio: row.fecha_hora_inicio as Date,
    fecha_hora_fin: (row.fecha_hora_fin as Date) ?? null,
    coordenada_inicio: parseCoordenadaInicio(row.coordenada_inicio),
    stock_inicial_consolidado:
      (row.stock_inicial_consolidado as Record<string, unknown>) ?? {},
  };
}

function mapInventarioRow(row: Record<string, unknown>): InventarioItem {
  return {
    id_producto: row.id_producto as string,
    nombre: row.nombre as string,
    precio_unitario: Number(row.precio_unitario),
    foto_url: (row.foto_url as string | null) ?? null,
    stock_inicial: row.stock_inicial as number,
    stock_actual: row.stock_actual as number,
  };
}

function buildCurrentShiftResponse(
  jornada: JornadaRow,
  inventario: InventarioItem[],
): CurrentShiftResponse {
  const snapshot = jornada.stock_inicial_consolidado;
  const rawItems = (snapshot.items ?? []) as Array<Record<string, unknown>>;
  const snapshotItems: SnapshotItem[] = rawItems.map((item) => ({
    id_producto: item.id_producto as string,
    nombre: item.nombre as string,
    precio_unitario: Number(item.precio_unitario),
    cantidad_inicial:
      (item.cantidad_inicial as number) ??
      (item.stock_inicial as number) ??
      0,
  }));
  const totalUnidades = snapshotItems.reduce(
    (acc, item) => acc + item.cantidad_inicial,
    0,
  );

  const base = {
    id_jornada: jornada.id_jornada,
    id_vendedor: jornada.id_vendedor,
    estado: jornada.estado,
    fecha_hora_inicio: jornada.fecha_hora_inicio.toISOString(),
    coordenada_inicio: jornada.coordenada_inicio,
    stock_inicial_consolidado: {
      fecha_snapshot: snapshot.fecha_snapshot as string,
      total_unidades: totalUnidades,
      items: snapshotItems,
    },
    inventario,
  };

  return jornada.fecha_hora_fin
    ? { ...base, fecha_hora_fin: jornada.fecha_hora_fin.toISOString() }
    : base;
}

const JORNADA_COLUMNS = `
  j.id_jornada,
  j.id_vendedor,
  j.estado,
  j.fecha_hora_inicio,
  j.fecha_hora_fin,
  ST_AsGeoJSON(j.coordenada_inicio)::json AS coordenada_inicio,
  j.stock_inicial_consolidado
`;

const JORNADA_COLUMNS_RETURNING = `
  id_jornada,
  id_vendedor,
  estado,
  fecha_hora_inicio,
  fecha_hora_fin,
  ST_AsGeoJSON(coordenada_inicio)::json AS coordenada_inicio,
  stock_inicial_consolidado
`;

const INVENTARIO_COLUMNS = `
  ij.id_producto,
  p.nombre,
  p.precio_unitario,
  p.foto_url,
  ij.stock_inicial,
  ij.stock_actual
`;

@Injectable()
export class ShiftsRepository {
  constructor(@Inject('DATABASE_POOL') private readonly pool: Pool) {}

  async findCurrentShift(
    idVendedor: string,
  ): Promise<CurrentShiftResponse | null> {
    const result = await this.pool.query(
      `SELECT ${JORNADA_COLUMNS}
         FROM public.jornadas j
        WHERE j.id_vendedor = $1
          AND j.estado = 'ACTIVA'`,
      [idVendedor],
    );
    if ((result.rowCount ?? 0) === 0) {
      return null;
    }

    const jornada = mapJornadaRow(result.rows[0]);
    const inventario = await this.selectInventario(this.pool, jornada.id_jornada);
    return buildCurrentShiftResponse(jornada, inventario);
  }

  async startShift(
    idVendedor: string,
    dto: StartShiftDto,
  ): Promise<CurrentShiftResponse> {
    return this.withTransaction(async (client) => {
      const seller = await client.query(
        `SELECT estado_vendedor
           FROM public.usuarios
          WHERE id_usuario = $1`,
        [idVendedor],
      );
      if (
        (seller.rowCount ?? 0) === 0 ||
        seller.rows[0].estado_vendedor !== 'activo'
      ) {
        throw new VendedorNotActiveError(
          'Solo un vendedor activo puede iniciar una jornada.',
        );
      }

      const products = await client.query(
        `SELECT id_producto, nombre, precio_unitario, stock_base, foto_url
           FROM public.productos
          WHERE id_vendedor_autonomo = $1
            AND activo = true
            AND stock_base > 0`,
        [idVendedor],
      );

      const snapshotItems: SnapshotItem[] = products.rows.map((row) => ({
        id_producto: row.id_producto as string,
        nombre: row.nombre as string,
        precio_unitario: Number(row.precio_unitario),
        cantidad_inicial: row.stock_base as number,
      }));

      const totalUnidades = snapshotItems.reduce(
        (acc, item) => acc + item.cantidad_inicial,
        0,
      );
      if (totalUnidades === 0) {
        throw new NoStockAvailableError(
          'No se puede abrir una jornada sin mercadería disponible.',
        );
      }

      const existing = await client.query(
        `SELECT 1
           FROM public.jornadas
          WHERE id_vendedor = $1 AND estado = 'ACTIVA'`,
        [idVendedor],
      );
      if ((existing.rowCount ?? 0) > 0) {
        throw new ShiftAlreadyActiveError(
          'Ya tiene una jornada activa. Finalice la jornada actual antes de abrir una nueva.',
        );
      }

      const snapshot = {
        fecha_snapshot: new Date().toISOString(),
        total_unidades: totalUnidades,
        items: snapshotItems,
      };

      let jornada: QueryResult;
      try {
        jornada = await client.query(
          `INSERT INTO public.jornadas
             (id_vendedor, estado, coordenada_inicio, incluye_autonomo, stock_inicial_consolidado)
           VALUES ($1, 'ACTIVA', ST_SetSRID(ST_MakePoint($2, $3), 4326), true, $4)
           RETURNING
             id_jornada,
             estado,
             fecha_hora_inicio,
             ST_AsGeoJSON(coordenada_inicio)::json AS coordenada_inicio,
             stock_inicial_consolidado`,
          [idVendedor, dto.lng, dto.lat, snapshot],
        );
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          throw new ShiftAlreadyActiveError(
            'Ya tiene una jornada activa. Finalice la jornada actual antes de abrir una nueva.',
          );
        }
        throw error;
      }

      const inserted = jornada.rows[0];

      for (const item of snapshotItems) {
        await client.query(
          `INSERT INTO public.inventario_jornada
             (id_jornada, id_producto, stock_inicial, stock_actual)
           VALUES ($1, $2, $3, $3)`,
          [inserted.id_jornada, item.id_producto, item.cantidad_inicial],
        );
        await client.query(
          `INSERT INTO public.movimientos_stock
             (id_producto, id_jornada, tipo, cantidad, saldo_resultante, origen_tipo, id_origen, id_usuario)
           VALUES ($1, $2, 'INGRESO', $3, $3, 'autonomo', $4, $4)`,
          [
            item.id_producto,
            inserted.id_jornada,
            item.cantidad_inicial,
            idVendedor,
          ],
        );
      }

      const inventario: InventarioItem[] = products.rows.map((row) => ({
        id_producto: row.id_producto as string,
        nombre: row.nombre as string,
        precio_unitario: Number(row.precio_unitario),
        foto_url: (row.foto_url as string | null) ?? null,
        stock_inicial: row.stock_base as number,
        stock_actual: row.stock_base as number,
      }));

      const jornadaRow = mapJornadaRow({
        id_jornada: inserted.id_jornada,
        id_vendedor: idVendedor,
        estado: inserted.estado,
        fecha_hora_inicio: inserted.fecha_hora_inicio,
        fecha_hora_fin: null,
        coordenada_inicio: inserted.coordenada_inicio,
        stock_inicial_consolidado: snapshot,
      });

      return buildCurrentShiftResponse(jornadaRow, inventario);
    });
  }

  async endShift(idVendedor: string): Promise<CurrentShiftResponse> {
    return this.withTransaction(async (client) => {
      const active = await client.query(
        `SELECT id_jornada
           FROM public.jornadas
          WHERE id_vendedor = $1 AND estado = 'ACTIVA'
            FOR UPDATE`,
        [idVendedor],
      );
      if ((active.rowCount ?? 0) === 0) {
        throw new NoActiveShiftError(
          'No se encontró una jornada activa para el vendedor.',
        );
      }
      const idJornada = active.rows[0].id_jornada as string;

      const pending = await client.query(
        `SELECT 1
           FROM public.pedidos
          WHERE id_jornada = $1
            AND estado IN ('solicitado', 'en_curso')`,
        [idJornada],
      );
      if ((pending.rowCount ?? 0) > 0) {
        throw new ShiftHasPendingOrdersError(
          'No se puede finalizar la jornada: tiene pedidos solicitados o en curso.',
        );
      }

      const result = await client.query(
        `UPDATE public.jornadas
            SET estado = 'FINALIZADA',
                fecha_hora_fin = NOW(),
                cierre_automatico = false
          WHERE id_jornada = $1
            AND id_vendedor = $2
            AND estado = 'ACTIVA'
         RETURNING ${JORNADA_COLUMNS_RETURNING}`,
        [idJornada, idVendedor],
      );

      if ((result.rowCount ?? 0) === 0) {
        throw new NoActiveShiftError(
          'No se encontró una jornada activa para el vendedor.',
        );
      }

      const jornada = mapJornadaRow(result.rows[0]);
      const inventario = await this.selectInventario(client, idJornada);
      return buildCurrentShiftResponse(jornada, inventario);
    });
  }

  async registerMerma(
    idVendedor: string,
    idProducto: string,
    cantidad: number,
    motivo: string,
  ): Promise<MermaResponse> {
    return this.withTransaction(async (client) => {
      const active = await client.query(
        `SELECT id_jornada
           FROM public.jornadas
          WHERE id_vendedor = $1 AND estado = 'ACTIVA'`,
        [idVendedor],
      );
      if ((active.rowCount ?? 0) === 0) {
        throw new NoActiveShiftError(
          'No se encontró una jornada activa para el vendedor.',
        );
      }
      const idJornada = active.rows[0].id_jornada as string;

      const invRow = await client.query(
        `SELECT stock_actual
           FROM public.inventario_jornada
          WHERE id_jornada = $1 AND id_producto = $2`,
        [idJornada, idProducto],
      );
      if ((invRow.rowCount ?? 0) === 0) {
        throw new ProductNotInJornadaError(
          'El producto no existe en el inventario de esta jornada.',
        );
      }

      const stockActual = invRow.rows[0].stock_actual as number;
      if (cantidad > stockActual) {
        throw new MermaExceedsStockError(
          `La cantidad de merma (${cantidad}) excede el stock actual disponible (${stockActual}).`,
        );
      }

      const nuevoStock = stockActual - cantidad;
      await client.query(
        `UPDATE public.inventario_jornada
            SET stock_actual = $3
          WHERE id_jornada = $1 AND id_producto = $2`,
        [idJornada, idProducto, nuevoStock],
      );

      await client.query(
        `INSERT INTO public.movimientos_stock
           (id_producto, id_jornada, tipo, cantidad, motivo, saldo_resultante, origen_tipo, id_origen, id_usuario)
         VALUES ($1, $2, 'MERMA', $3, $4, $5, 'autonomo', $6, $6)`,
        [idProducto, idJornada, cantidad, motivo, nuevoStock, idVendedor],
      );

      await client.query(
        `UPDATE public.productos
            SET stock_base = stock_base - $3
          WHERE id_producto = $1 AND id_vendedor_autonomo = $2`,
        [idProducto, idVendedor, cantidad],
      );

      return {
        id_producto: idProducto,
        stock_actual_anterior: stockActual,
        stock_actual_nuevo: nuevoStock,
        cantidad_mermada: cantidad,
        motivo,
      };
    });
  }

  private async selectInventario(
    runner: QueryRunner,
    idJornada: string,
  ): Promise<InventarioItem[]> {
    const result = await runner.query(
      `SELECT ${INVENTARIO_COLUMNS}
         FROM public.inventario_jornada ij
         JOIN public.productos p ON p.id_producto = ij.id_producto
        WHERE ij.id_jornada = $1
        ORDER BY p.nombre`,
      [idJornada],
    );
    return result.rows.map((row: Record<string, unknown>) =>
      mapInventarioRow(row),
    );
  }

  private isUniqueViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    return (error as { code?: unknown }).code === '23505';
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
}
