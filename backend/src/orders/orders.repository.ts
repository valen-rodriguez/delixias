import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

export class NoActiveShiftError extends Error {}
export class ProductNotAvailableError extends Error {}
export class ProductNotInShiftError extends Error {}
export class InsufficientStockError extends Error {}
export class PaymentMethodNotAvailableError extends Error {}
export class OrderNotFoundError extends Error {}
export class InvalidOrderTransitionError extends Error {}
export class CancellationReasonRequiredError extends Error {}
export class OrderExpiredError extends Error {}
export class ConcurrentOperationError extends Error {}

const CONCURRENCY_ERROR_CODES = new Set(['40001', '40P01', '23503', '23505']);

function isPostgresError(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string'
  );
}

function mapPostgresError(error: unknown): never {
  if (isPostgresError(error) && CONCURRENCY_ERROR_CODES.has(error.code)) {
    throw new ConcurrentOperationError(
      'La operación no pudo completarse por un conflicto de concurrencia. Reintente.',
    );
  }
  throw error;
}

export interface CreateOrderInput {
  id_vendedor: string;
  id_cliente: string;
  id_medio_pago: number;
  ubicacion_entrega: { lat: number; lng: number } | null;
  lineas: Array<{ id_producto: string; cantidad: number }>;
}

export interface OrderLine {
  id_producto: string;
  cantidad: number;
  precio_historico: number;
  origen_tipo: string;
  id_origen: string;
}

export interface Pedido {
  id_pedido: string;
  id_jornada: string;
  id_vendedor: string;
  id_cliente: string;
  id_medio_pago: number;
  estado: string;
  cancelado_por: string | null;
  motivo_cancela: string | null;
  ubicacion_entrega: { lat: number; lng: number } | null;
  total_orden: number;
  creado_el: Date;
  expira_el: Date | null;
  lineas: OrderLine[];
}

export interface PedidoSummary {
  id_pedido: string;
  id_vendedor: string;
  id_cliente: string;
  estado: string;
  total_orden: number;
  creado_el: Date;
  expira_el: Date | null;
  ubicacion_entrega: { lat: number; lng: number } | null;
  lineas_cantidad: number;
}

export interface ListOrdersFilters {
  id_vendedor?: string;
  id_cliente?: string;
  estado?: string;
  limite?: number;
  offset?: number;
}

export interface CloseShiftResult {
  id_jornada: string;
  id_vendedor: string;
  cerrados: Array<{ id_pedido: string; id_cliente: string; id_vendedor: string }>;
  yaFinalizada: boolean;
}

export interface ExpiredOrderResult {
  id_pedido: string;
  id_cliente: string;
  id_vendedor: string;
}

const PEDIDO_RETURNING = `
  id_pedido,
  id_jornada,
  id_vendedor,
  id_cliente,
  id_medio_pago,
  estado,
  cancelado_por,
  motivo_cancela,
  ST_AsGeoJSON(ubicacion_entrega)::json AS ubicacion_entrega,
  total_orden,
  creado_el,
  expira_el
`;

const PEDIDO_SELECT = PEDIDO_RETURNING;

const LINEA_SELECT = `
  id_producto,
  cantidad,
  precio_historico,
  origen_tipo,
  id_origen
`;

function mapPedido(row: Record<string, unknown>): Pedido {
  return {
    id_pedido: row.id_pedido as string,
    id_jornada: row.id_jornada as string,
    id_vendedor: row.id_vendedor as string,
    id_cliente: row.id_cliente as string,
    id_medio_pago: row.id_medio_pago as number,
    estado: row.estado as string,
    cancelado_por: (row.cancelado_por as string | null) ?? null,
    motivo_cancela: (row.motivo_cancela as string | null) ?? null,
    ubicacion_entrega:
      (row.ubicacion_entrega as { lat: number; lng: number } | null) ?? null,
    total_orden: Number(row.total_orden),
    creado_el: row.creado_el as Date,
    expira_el: (row.expira_el as Date | null) ?? null,
    lineas: [],
  };
}

function mapLinea(row: Record<string, unknown>): OrderLine {
  return {
    id_producto: row.id_producto as string,
    cantidad: row.cantidad as number,
    precio_historico: Number(row.precio_historico),
    origen_tipo: row.origen_tipo as string,
    id_origen: row.id_origen as string,
  };
}

function mapSummary(row: Record<string, unknown>): PedidoSummary {
  return {
    id_pedido: row.id_pedido as string,
    id_vendedor: row.id_vendedor as string,
    id_cliente: row.id_cliente as string,
    estado: row.estado as string,
    total_orden: Number(row.total_orden),
    creado_el: row.creado_el as Date,
    expira_el: (row.expira_el as Date | null) ?? null,
    ubicacion_entrega:
      (row.ubicacion_entrega as { lat: number; lng: number } | null) ?? null,
    lineas_cantidad: Number(row.lineas_cantidad),
  };
}

@Injectable()
export class OrdersRepository {
  constructor(@Inject('DATABASE_POOL') private readonly pool: Pool) {}

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
      try {
        await client.query('ROLLBACK');
      } catch {
        // swallow rollback errors so the original error is preserved
      }
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async createOrder(
    input: CreateOrderInput,
    timeoutMinutes: number,
  ): Promise<Pedido> {
    return this.withTransaction(async (client) => {
      const activeShift = await client.query(
        `SELECT id_jornada
           FROM public.jornadas
          WHERE id_vendedor = $1 AND estado = 'ACTIVA'
          FOR SHARE`,
        [input.id_vendedor],
      );
      if ((activeShift.rowCount ?? 0) === 0) {
        throw new NoActiveShiftError(
          'No existe una jornada activa para el vendedor.',
        );
      }
      const idJornada = activeShift.rows[0].id_jornada as string;

      const payment = await client.query(
        `SELECT 1
           FROM public.usuario_medios_pago ump
           JOIN public.medios_pago_catalogo mpc
             ON mpc.id_medio_pago = ump.id_medio_pago
          WHERE ump.id_usuario = $1
            AND ump.id_medio_pago = $2
            AND mpc.activo = true`,
        [input.id_vendedor, input.id_medio_pago],
      );
      if ((payment.rowCount ?? 0) === 0) {
        throw new PaymentMethodNotAvailableError(
          'El medio de pago no está disponible para el vendedor.',
        );
      }

      const consolidated = new Map<string, { id_producto: string; cantidad: number }>();
      for (const linea of input.lineas) {
        const existing = consolidated.get(linea.id_producto);
        if (existing) {
          existing.cantidad += linea.cantidad;
        } else {
          consolidated.set(linea.id_producto, { ...linea });
        }
      }
      const lineas = Array.from(consolidated.values()).sort((a, b) =>
        a.id_producto.localeCompare(b.id_producto),
      );

      const precios = new Map<string, number>();
      for (const linea of lineas) {
        const product = await client.query(
          `SELECT precio_unitario
             FROM public.productos
            WHERE id_producto = $1
              AND id_vendedor_autonomo = $2
              AND activo = true`,
          [linea.id_producto, input.id_vendedor],
        );
        if ((product.rowCount ?? 0) === 0) {
          throw new ProductNotAvailableError(
            'El producto no existe, está inactivo o no pertenece al vendedor.',
          );
        }
        precios.set(linea.id_producto, Number(product.rows[0].precio_unitario));
      }

      for (const linea of lineas) {
        const inventory = await client.query(
          `SELECT stock_actual
             FROM public.inventario_jornada
            WHERE id_jornada = $1 AND id_producto = $2
            FOR UPDATE`,
          [idJornada, linea.id_producto],
        );
        if ((inventory.rowCount ?? 0) === 0) {
          throw new ProductNotInShiftError(
            'El producto no fue cargado en la jornada activa.',
          );
        }
        if ((inventory.rows[0].stock_actual as number) < linea.cantidad) {
          throw new InsufficientStockError(
            'Stock insuficiente para una de las líneas del pedido.',
          );
        }
      }

      for (const linea of lineas) {
        const updated = await client.query(
          `UPDATE public.inventario_jornada
              SET stock_actual = stock_actual - $3
            WHERE id_jornada = $1
              AND id_producto = $2
              AND stock_actual >= $3`,
          [idJornada, linea.id_producto, linea.cantidad],
        );
        if ((updated.rowCount ?? 0) === 0) {
          const recheck = await client.query(
            `SELECT stock_actual
               FROM public.inventario_jornada
              WHERE id_jornada = $1 AND id_producto = $2`,
            [idJornada, linea.id_producto],
          );
          if ((recheck.rowCount ?? 0) === 0) {
            throw new ProductNotInShiftError(
              'El producto no fue cargado en la jornada activa.',
            );
          }
          if ((recheck.rows[0].stock_actual as number) < linea.cantidad) {
            throw new InsufficientStockError(
              'Stock insuficiente para una de las líneas del pedido.',
            );
          }
          throw new ConcurrentOperationError(
            'Otra operación modificó el inventario durante la reserva.',
          );
        }
      }

      let total = 0;
      const lineasConPrecio: OrderLine[] = lineas.map((linea) => {
        const precio = precios.get(linea.id_producto) as number;
        total += precio * linea.cantidad;
        return {
          id_producto: linea.id_producto,
          cantidad: linea.cantidad,
          precio_historico: precio,
          origen_tipo: 'autonomo',
          id_origen: input.id_vendedor,
        };
      });

      const ubicacion = input.ubicacion_entrega;
      const pedidoResult = await client.query(
        `INSERT INTO public.pedidos
           (id_cliente, id_vendedor, id_jornada, estado, id_medio_pago,
            ubicacion_entrega, total_orden, expira_el)
         VALUES ($1, $2, $3, 'solicitado', $4,
            CASE WHEN $5::double precision IS NULL OR $6::double precision IS NULL
                 THEN NULL
                 ELSE ST_SetSRID(ST_MakePoint($5, $6), 4326) END,
            $7, NOW() + ($8 * INTERVAL '1 minute'))
         RETURNING ${PEDIDO_RETURNING}`,
        [
          input.id_cliente,
          input.id_vendedor,
          idJornada,
          input.id_medio_pago,
          ubicacion?.lng ?? null,
          ubicacion?.lat ?? null,
          total,
          timeoutMinutes,
        ],
      );

      const idPedido = pedidoResult.rows[0].id_pedido as string;
      const lineasInsertadas: OrderLine[] = [];
      for (const linea of lineasConPrecio) {
        const inserted = await client.query(
          `INSERT INTO public.detalle_pedidos
             (id_pedido, id_producto, cantidad, precio_historico, origen_tipo, id_origen)
           VALUES ($1, $2, $3, $4, 'autonomo', $5)
           RETURNING ${LINEA_SELECT}`,
          [
            idPedido,
            linea.id_producto,
            linea.cantidad,
            linea.precio_historico,
            input.id_vendedor,
          ],
        );
        lineasInsertadas.push(mapLinea(inserted.rows[0]));
      }

      const pedido = mapPedido(pedidoResult.rows[0]);
      pedido.lineas = lineasInsertadas;
      return pedido;
    });
  }

  async findPedidoById(idPedido: string): Promise<Pedido | null> {
    const result = await this.pool.query(
      `SELECT ${PEDIDO_SELECT}
         FROM public.pedidos
        WHERE id_pedido = $1`,
      [idPedido],
    );
    if ((result.rowCount ?? 0) === 0) {
      return null;
    }
    const pedido = mapPedido(result.rows[0]);
    const lineas = await this.pool.query(
      `SELECT ${LINEA_SELECT}
         FROM public.detalle_pedidos
        WHERE id_pedido = $1
        ORDER BY id_producto`,
      [idPedido],
    );
    pedido.lineas = lineas.rows.map((row) => mapLinea(row));
    return pedido;
  }

  async listOrders(filters: ListOrdersFilters): Promise<PedidoSummary[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let index = 1;
    if (filters.id_vendedor) {
      conditions.push(`p.id_vendedor = $${index++}`);
      params.push(filters.id_vendedor);
    }
    if (filters.id_cliente) {
      conditions.push(`p.id_cliente = $${index++}`);
      params.push(filters.id_cliente);
    }
    if (filters.estado) {
      conditions.push(`p.estado = $${index++}`);
      params.push(filters.estado);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limite = filters.limite ?? 20;
    const offset = filters.offset ?? 0;
    params.push(limite, offset);
    const result = await this.pool.query(
      `SELECT p.id_pedido, p.id_vendedor, p.id_cliente, p.estado, p.total_orden,
              p.creado_el, p.expira_el,
              ST_AsGeoJSON(p.ubicacion_entrega)::json AS ubicacion_entrega,
              COUNT(d.id_producto)::int AS lineas_cantidad
         FROM public.pedidos p
         LEFT JOIN public.detalle_pedidos d ON d.id_pedido = p.id_pedido
         ${where}
        GROUP BY p.id_pedido, p.id_vendedor, p.id_cliente, p.estado, p.total_orden,
                 p.creado_el, p.expira_el, p.ubicacion_entrega
        ORDER BY p.creado_el DESC
        LIMIT $${index++} OFFSET $${index++}`,
      params,
    );
    return result.rows.map((row) => mapSummary(row));
  }

  async listActiveOrdersByVendor(idVendedor: string): Promise<PedidoSummary[]> {
    const result = await this.pool.query(
      `SELECT p.id_pedido,
              p.id_vendedor,
              p.id_cliente,
              p.estado,
              p.total_orden,
              p.creado_el,
              p.expira_el,
              ST_AsGeoJSON(p.ubicacion_entrega)::json AS ubicacion_entrega,
              COUNT(d.id_producto)::int               AS lineas_cantidad
       FROM public.pedidos p
              LEFT JOIN public.detalle_pedidos d ON d.id_pedido = p.id_pedido
       WHERE p.id_vendedor = $1
         AND p.estado IN ('solicitado', 'en_curso')
       GROUP BY p.id_pedido, p.id_vendedor, p.id_cliente, p.estado, p.total_orden,
                p.creado_el, p.expira_el, p.ubicacion_entrega
       ORDER BY p.creado_el`,
      [idVendedor],
    );
    return result.rows.map((row) => mapSummary(row));
  }

  async acceptOrder(idPedido: string, idVendedor: string): Promise<Pedido> {
    return this.withTransaction(async (client) => {
      const locked = await client.query(
        `SELECT id_pedido, estado, id_jornada, expira_el
           FROM public.pedidos
          WHERE id_pedido = $1 AND id_vendedor = $2
          FOR UPDATE`,
        [idPedido, idVendedor],
      );
      if ((locked.rowCount ?? 0) === 0) {
        throw new OrderNotFoundError('Pedido no encontrado.');
      }
      if (locked.rows[0].estado !== 'solicitado') {
        throw new InvalidOrderTransitionError(
          'El pedido no está en estado solicitado.',
        );
      }
      const expiraEl = locked.rows[0].expira_el as Date | null;
      if (expiraEl && expiraEl.getTime() <= Date.now()) {
        throw new OrderExpiredError(
          'El pedido venció antes de la aceptación.',
        );
      }
      const idJornada = locked.rows[0].id_jornada as string;

      const shift = await client.query(
        `SELECT estado FROM public.jornadas WHERE id_jornada = $1`,
        [idJornada],
      );
      if (
        (shift.rowCount ?? 0) === 0 ||
        shift.rows[0].estado !== 'ACTIVA'
      ) {
        throw new InvalidOrderTransitionError(
          'La jornada asociada ya no está activa.',
        );
      }

      await client.query(
        `UPDATE public.pedidos SET estado = 'en_curso' WHERE id_pedido = $1`,
        [idPedido],
      );

      return this.readPedido(client, idPedido);
    });
  }

  async rejectOrder(
    idPedido: string,
    idVendedor: string,
  ): Promise<Pedido> {
    return this.withTransaction(async (client) => {
      const locked = await client.query(
        `SELECT id_pedido, estado, id_jornada
           FROM public.pedidos
          WHERE id_pedido = $1 AND id_vendedor = $2
          FOR UPDATE`,
        [idPedido, idVendedor],
      );
      if ((locked.rowCount ?? 0) === 0) {
        throw new OrderNotFoundError('Pedido no encontrado.');
      }
      if (locked.rows[0].estado !== 'solicitado') {
        throw new InvalidOrderTransitionError(
          'El pedido no está en estado solicitado.',
        );
      }
      const idJornada = locked.rows[0].id_jornada as string;

      await this.restoreStock(client, idPedido, idJornada);
      await client.query(
        `UPDATE public.pedidos SET estado = 'rechazado' WHERE id_pedido = $1`,
        [idPedido],
      );

      return this.readPedido(client, idPedido);
    });
  }

  async completeOrder(idPedido: string, idVendedor: string): Promise<Pedido> {
    return this.withTransaction(async (client) => {
      const locked = await client.query(
        `SELECT id_pedido, estado, id_jornada
           FROM public.pedidos
          WHERE id_pedido = $1 AND id_vendedor = $2
          FOR UPDATE`,
        [idPedido, idVendedor],
      );
      if ((locked.rowCount ?? 0) === 0) {
        throw new OrderNotFoundError('Pedido no encontrado.');
      }
      if (locked.rows[0].estado !== 'en_curso') {
        throw new InvalidOrderTransitionError(
          'El pedido no está en estado en_curso.',
        );
      }
      const idJornada = locked.rows[0].id_jornada as string;

      const lineas = await client.query(
        `SELECT id_producto, cantidad
           FROM public.detalle_pedidos
          WHERE id_pedido = $1
          ORDER BY id_producto`,
        [idPedido],
      );

      for (const row of lineas.rows) {
        const idProducto = row.id_producto as string;
        const cantidad = row.cantidad as number;

        const inventory = await client.query(
          `SELECT stock_inicial
             FROM public.inventario_jornada
            WHERE id_jornada = $1 AND id_producto = $2
            FOR UPDATE`,
          [idJornada, idProducto],
        );
        if ((inventory.rowCount ?? 0) === 0) {
          throw new ProductNotInShiftError(
            'El producto ya no pertenece a la jornada.',
          );
        }

        const lastMovement = await client.query(
          `SELECT saldo_resultante
             FROM public.movimientos_stock
            WHERE id_jornada = $1 AND id_producto = $2
            ORDER BY creado_el DESC, id_movimiento DESC
            LIMIT 1`,
          [idJornada, idProducto],
        );
        const saldoPrevio =
          (lastMovement.rowCount ?? 0) > 0
            ? (lastMovement.rows[0].saldo_resultante as number)
            : (inventory.rows[0].stock_inicial as number);
        const saldoResultante = Math.max(0, saldoPrevio - cantidad);

        await client.query(
          `INSERT INTO public.movimientos_stock
             (id_producto, id_jornada, tipo, cantidad, saldo_resultante,
              origen_tipo, id_origen, id_usuario, motivo)
           VALUES ($1, $2, 'EGRESO_VENTA', $3, $4, 'autonomo', $5, $5, NULL)`,
          [idProducto, idJornada, cantidad, saldoResultante, idVendedor],
        );
      }

      await client.query(
        `UPDATE public.pedidos SET estado = 'completado' WHERE id_pedido = $1`,
        [idPedido],
      );

      return this.readPedido(client, idPedido);
    });
  }

  async cancelOrder(
    idPedido: string,
    actorId: string,
    motivo: string | null | undefined,
  ): Promise<Pedido> {
    return this.withTransaction(async (client) => {
      const locked = await client.query(
        `SELECT id_pedido, id_cliente, id_vendedor, estado, id_jornada
           FROM public.pedidos
          WHERE id_pedido = $1
          FOR UPDATE`,
        [idPedido],
      );
      if ((locked.rowCount ?? 0) === 0) {
        throw new OrderNotFoundError('Pedido no encontrado.');
      }
      const row = locked.rows[0];
      const esVendedor = row.id_vendedor === actorId;
      const esCliente = row.id_cliente === actorId;
      if (!esVendedor && !esCliente) {
        throw new OrderNotFoundError('Pedido no encontrado.');
      }
      const estado = row.estado as string;

      let canceladoPor: 'vendedor' | 'cliente';
      let motivoFinal: string;
      if (esVendedor) {
        if (estado !== 'en_curso') {
          throw new InvalidOrderTransitionError(
            'El vendedor solo puede cancelar pedidos en_curso.',
          );
        }
        const limpio = motivo?.trim();
        if (!limpio) {
          throw new CancellationReasonRequiredError(
            'El motivo de cancelación es obligatorio para el vendedor.',
          );
        }
        canceladoPor = 'vendedor';
        motivoFinal = limpio;
      } else {
        if (estado !== 'solicitado' && estado !== 'en_curso') {
          throw new InvalidOrderTransitionError(
            'El cliente solo puede cancelar pedidos operativos.',
          );
        }
        canceladoPor = 'cliente';
        motivoFinal = motivo?.trim() || 'Cancelado por el cliente';
      }

      const idJornada = row.id_jornada as string;
      await this.restoreStock(client, idPedido, idJornada);
      await client.query(
        `UPDATE public.pedidos
            SET estado = 'cancelado',
                cancelado_por = $2,
                motivo_cancela = $3
          WHERE id_pedido = $1`,
        [idPedido, canceladoPor, motivoFinal],
      );

      return this.readPedido(client, idPedido);
    });
  }

  async expireTimedOutOrders(limit: number): Promise<ExpiredOrderResult[]> {
    return this.withTransaction(async (client) => {
      const candidates = await client.query(
        `SELECT id_pedido, id_cliente, id_vendedor, id_jornada
           FROM public.pedidos
          WHERE estado = 'solicitado'
            AND expira_el IS NOT NULL
            AND expira_el <= NOW()
          ORDER BY expira_el
          LIMIT $1
          FOR UPDATE SKIP LOCKED`,
        [limit],
      );

      const expirados: ExpiredOrderResult[] = [];
      for (const row of candidates.rows) {
        const idPedido = row.id_pedido as string;
        const idJornada = row.id_jornada as string;

        await this.restoreStock(client, idPedido, idJornada);
        await client.query(
          `UPDATE public.pedidos
              SET estado = 'cancelado',
                  cancelado_por = 'vendedor',
                  motivo_cancela = 'Timeout: sin respuesta del vendedor'
            WHERE id_pedido = $1 AND estado = 'solicitado'`,
          [idPedido],
        );
        expirados.push({
          id_pedido: idPedido,
          id_cliente: row.id_cliente as string,
          id_vendedor: row.id_vendedor as string,
        });
      }

      return expirados;
    });
  }

  async closeShiftAndCancelPendingOrders(
    idJornada: string,
    motivo: string,
  ): Promise<CloseShiftResult | null> {
    return this.withTransaction(async (client) => {
      const jornada = await client.query(
        `SELECT id_jornada, id_vendedor, estado
           FROM public.jornadas
          WHERE id_jornada = $1
          FOR UPDATE`,
        [idJornada],
      );
      if (
        (jornada.rowCount ?? 0) === 0 ||
        jornada.rows[0].estado !== 'ACTIVA'
      ) {
        return null;
      }
      const idVendedor = jornada.rows[0].id_vendedor as string;

      const pendientes = await client.query(
        `SELECT id_pedido, id_cliente, id_vendedor
           FROM public.pedidos
          WHERE id_jornada = $1
            AND estado IN ('solicitado', 'en_curso')
          FOR UPDATE`,
        [idJornada],
      );

      const cerrados: CloseShiftResult['cerrados'] = [];
      for (const row of pendientes.rows) {
        const idPedido = row.id_pedido as string;
        await this.restoreStock(client, idPedido, idJornada);
        await client.query(
          `UPDATE public.pedidos
              SET estado = 'cancelado',
                  cancelado_por = 'vendedor',
                  motivo_cancela = $2
            WHERE id_pedido = $1`,
          [idPedido, motivo],
        );
        cerrados.push({
          id_pedido: idPedido,
          id_cliente: row.id_cliente as string,
          id_vendedor: row.id_vendedor as string,
        });
      }

      await client.query(
        `UPDATE public.jornadas
            SET estado = 'FINALIZADA',
                fecha_hora_fin = NOW(),
                cierre_automatico = true
          WHERE id_jornada = $1`,
        [idJornada],
      );

      return {
        id_jornada: idJornada,
        id_vendedor: idVendedor,
        cerrados,
        yaFinalizada: false,
      };
    });
  }

  private async restoreStock(
    client: PoolClient,
    idPedido: string,
    idJornada: string,
  ): Promise<void> {
    const lineas = await client.query(
      `SELECT id_producto, cantidad
         FROM public.detalle_pedidos
        WHERE id_pedido = $1`,
      [idPedido],
    );
    for (const row of lineas.rows) {
      await client.query(
        `UPDATE public.inventario_jornada
            SET stock_actual = stock_actual + $3
          WHERE id_jornada = $1 AND id_producto = $2`,
        [idJornada, row.id_producto as string, row.cantidad as number],
      );
    }
  }

  private async readPedido(
    client: PoolClient,
    idPedido: string,
  ): Promise<Pedido> {
    const result = await client.query(
      `SELECT ${PEDIDO_SELECT} FROM public.pedidos WHERE id_pedido = $1`,
      [idPedido],
    );
    const pedido = mapPedido(result.rows[0]);
    const lineas = await client.query(
      `SELECT ${LINEA_SELECT}
         FROM public.detalle_pedidos
        WHERE id_pedido = $1
        ORDER BY id_producto`,
      [idPedido],
    );
    pedido.lineas = lineas.rows.map((row) => mapLinea(row));
    return pedido;
  }
}
