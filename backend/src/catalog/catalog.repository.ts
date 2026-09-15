import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient, QueryResult } from 'pg';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { CategoryRow } from './entities/category.entity.js';
import {
  ProductRow,
  SoftDeletedProduct,
} from './entities/product.entity.js';

export class CategoryNotFoundError extends Error {}
export class ProductNotFoundError extends Error {}
export class ProductReductionBlockedError extends Error {}
export class ProductDeleteBlockedError extends Error {}

export interface ProductUpdate {
  nombre?: string;
  precio_unitario?: number;
  stock_base?: number;
  hasFotoUrl: boolean;
  foto_url?: string | null;
}

const PRODUCT_COLUMNS = `
  id_producto, id_categoria, nombre, precio_unitario, stock_base, foto_url, activo
`;

function mapProduct(row: Record<string, unknown>): ProductRow {
  return {
    id_producto: row.id_producto as string,
    id_categoria: row.id_categoria as number,
    nombre: row.nombre as string,
    precio_unitario: Number(row.precio_unitario),
    stock_base: row.stock_base as number,
    foto_url: (row.foto_url as string | null) ?? null,
    activo: row.activo as boolean,
  };
}

interface ActiveShift {
  id_jornada: string;
}

@Injectable()
export class CatalogRepository {
  constructor(@Inject('DATABASE_POOL') private readonly pool: Pool) {}

  async listCategories(): Promise<CategoryRow[]> {
    const result = await this.pool.query<CategoryRow>(
      `SELECT id_categoria, nombre
         FROM public.categorias
        ORDER BY id_categoria`,
    );
    return result.rows;
  }

  async findProductOwned(
    idProducto: string,
    idVendedor: string,
  ): Promise<ProductRow | null> {
    const result = await this.pool.query(
      `SELECT ${PRODUCT_COLUMNS}
         FROM public.productos
        WHERE id_producto = $1 AND id_vendedor_autonomo = $2`,
      [idProducto, idVendedor],
    );
    return (result.rowCount ?? 0) > 0 ? mapProduct(result.rows[0]) : null;
  }

  async listProductsByVendor(
    idVendedor: string,
    incluyeInactivos: boolean,
  ): Promise<ProductRow[]> {
    const filter = incluyeInactivos ? '' : ' AND activo = true';
    const result = await this.pool.query(
      `SELECT ${PRODUCT_COLUMNS}
         FROM public.productos
        WHERE id_vendedor_autonomo = $1${filter}
        ORDER BY nombre`,
      [idVendedor],
    );
    return result.rows.map((row) => mapProduct(row));
  }

  async createProduct(
    idVendedor: string,
    dto: CreateProductDto,
  ): Promise<ProductRow> {
    return this.withTransaction(async (client) => {
      const category = await client.query(
        `SELECT 1 FROM public.categorias WHERE id_categoria = $1`,
        [dto.id_categoria],
      );
      if (category.rowCount === 0) {
        throw new CategoryNotFoundError(
          `La categoría ${dto.id_categoria} no existe.`,
        );
      }

      let result: QueryResult;
      try {
        result = await client.query(
          `INSERT INTO public.productos
             (id_vendedor_autonomo, id_categoria, nombre, precio_unitario, stock_base, foto_url, activo)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           RETURNING ${PRODUCT_COLUMNS}`,
          [
            idVendedor,
            dto.id_categoria,
            dto.nombre,
            dto.precio_unitario,
            dto.stock_base,
            dto.foto_url ?? null,
          ],
        );
      } catch (error) {
        if (this.isForeignKeyViolation(error)) {
          throw new CategoryNotFoundError(
            `La categoría ${dto.id_categoria} no existe.`,
          );
        }
        throw error;
      }

      const created = mapProduct(result.rows[0]);
      const shift = await this.findActiveShift(client, idVendedor);
      if (shift && created.stock_base > 0) {
        await this.addToInventario(
          client,
          shift.id_jornada,
          created.id_producto,
          idVendedor,
          created.stock_base,
        );
      }
      return created;
    });
  }

  async updateProduct(
    idProducto: string,
    idVendedor: string,
    changes: ProductUpdate,
  ): Promise<ProductRow> {
    return this.withTransaction(async (client) => {
      const current = await client.query(
        `SELECT ${PRODUCT_COLUMNS}
           FROM public.productos
          WHERE id_producto = $1 AND id_vendedor_autonomo = $2`,
        [idProducto, idVendedor],
      );
      if (current.rowCount === 0) {
        throw new ProductNotFoundError('Producto no encontrado.');
      }

      const currentRow = mapProduct(current.rows[0]);
      const shift = await this.findActiveShift(client, idVendedor);

      const sets: string[] = [];
      const values: unknown[] = [idProducto];
      const push = (column: string, value: unknown) => {
        sets.push(`${column} = $${values.length + 1}`);
        values.push(value);
      };

      if (changes.nombre !== undefined) push('nombre', changes.nombre);
      if (changes.precio_unitario !== undefined) {
        push('precio_unitario', changes.precio_unitario);
      }
      if (changes.hasFotoUrl) push('foto_url', changes.foto_url ?? null);

      let stockDelta = 0;
      const nextStockBase = changes.stock_base ?? currentRow.stock_base;
      if (changes.stock_base !== undefined) {
        stockDelta = changes.stock_base - currentRow.stock_base;
        if (shift && stockDelta < 0) {
          throw new ProductReductionBlockedError(
            'No se puede reducir el stock maestro con una jornada activa: finalice la jornada, edite el catálogo y vuelva a abrir.',
          );
        }
        push('stock_base', changes.stock_base);
      }

      let result: QueryResult;
      if (sets.length > 0) {
        result = await client.query(
          `UPDATE public.productos
              SET ${sets.join(', ')}
            WHERE id_producto = $1
           RETURNING ${PRODUCT_COLUMNS}`,
          values,
        );
      } else {
        result = current;
      }

      if (shift && stockDelta > 0) {
        const inv = await client.query(
          `SELECT stock_inicial, stock_actual
             FROM public.inventario_jornada
            WHERE id_jornada = $1 AND id_producto = $2`,
          [shift.id_jornada, currentRow.id_producto],
        );
        if ((inv.rowCount ?? 0) > 0) {
          const stockActual = (inv.rows[0].stock_actual as number) + stockDelta;
          const stockInicial =
            (inv.rows[0].stock_inicial as number) + stockDelta;
          await client.query(
            `UPDATE public.inventario_jornada
                SET stock_inicial = $3, stock_actual = $4
              WHERE id_jornada = $1 AND id_producto = $2`,
            [shift.id_jornada, currentRow.id_producto, stockInicial, stockActual],
          );
          await this.insertKardex(
            client,
            shift.id_jornada,
            currentRow.id_producto,
            idVendedor,
            stockDelta,
            stockActual,
          );
        } else {
          await this.addToInventario(
            client,
            shift.id_jornada,
            currentRow.id_producto,
            idVendedor,
            nextStockBase,
          );
        }
      }

      return mapProduct(result.rows[0]);
    });
  }

  async softDeleteProduct(
    idProducto: string,
    idVendedor: string,
  ): Promise<SoftDeletedProduct> {
    return this.withTransaction(async (client) => {
      const current = await client.query(
        `SELECT ${PRODUCT_COLUMNS}
           FROM public.productos
          WHERE id_producto = $1 AND id_vendedor_autonomo = $2`,
        [idProducto, idVendedor],
      );
      if (current.rowCount === 0) {
        throw new ProductNotFoundError('Producto no encontrado.');
      }

      const shift = await this.findActiveShift(client, idVendedor);
      if (shift) {
        throw new ProductDeleteBlockedError(
          'No se puede dar de baja un producto con una jornada activa: finalice la jornada primero.',
        );
      }

      await client.query(
        `UPDATE public.productos
            SET activo = false
          WHERE id_producto = $1 AND id_vendedor_autonomo = $2`,
        [idProducto, idVendedor],
      );
      return { id_producto: idProducto, activo: false };
    });
  }

  private async findActiveShift(
    client: PoolClient,
    idVendedor: string,
  ): Promise<ActiveShift | null> {
    const result = await client.query(
      `SELECT id_jornada
         FROM public.jornadas
        WHERE id_vendedor = $1 AND estado = 'ACTIVA'`,
      [idVendedor],
    );
    return (result.rowCount ?? 0) > 0 ? { id_jornada: result.rows[0].id_jornada } : null;
  }

  private async addToInventario(
    client: PoolClient,
    idJornada: string,
    idProducto: string,
    idVendedor: string,
    cantidad: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO public.inventario_jornada
         (id_jornada, id_producto, stock_inicial, stock_actual)
       VALUES ($1, $2, $3, $3)`,
      [idJornada, idProducto, cantidad],
    );
    await this.insertKardex(
      client,
      idJornada,
      idProducto,
      idVendedor,
      cantidad,
      cantidad,
    );
  }

  private async insertKardex(
    client: PoolClient,
    idJornada: string,
    idProducto: string,
    idVendedor: string,
    cantidad: number,
    saldoResultante: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO public.movimientos_stock
         (id_producto, id_jornada, tipo, cantidad, saldo_resultante, origen_tipo, id_origen, id_usuario)
       VALUES ($1, $2, 'INGRESO', $3, $4, 'autonomo', $5, $5)`,
      [idProducto, idJornada, cantidad, saldoResultante, idVendedor],
    );
  }

  private isForeignKeyViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    return (error as { code?: unknown }).code === '23503';
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