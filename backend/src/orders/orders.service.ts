import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AppConfiguration } from '../config/configuration.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { QueryOrdersDto } from './dto/query-orders.dto.js';
import type {
  OrderResponse,
  OrderSummaryResponse,
} from './entities/order-response.entity.js';
import {
  CancellationReasonRequiredError,
  ConcurrentOperationError,
  InsufficientStockError,
  InvalidOrderTransitionError,
  NoActiveShiftError,
  OrderExpiredError,
  OrderNotFoundError,
  OrdersRepository,
  PaymentMethodNotAvailableError,
  ProductNotAvailableError,
  ProductNotInShiftError,
  type CloseShiftResult,
  type Pedido,
} from './orders.repository.js';

@Injectable()
export class OrdersService {
  private readonly timeoutMinutes: number;

  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly eventEmitter: EventEmitter2,
    config: ConfigService<AppConfiguration>,
  ) {
    this.timeoutMinutes = config.get('orderTimeoutMinutes') ?? 3;
  }

  async createOrder(
    idCliente: string,
    dto: CreateOrderDto,
  ): Promise<OrderResponse> {
    try {
      const pedido = await this.ordersRepository.createOrder(
        {
          id_vendedor: dto.id_vendedor,
          id_cliente: idCliente,
          id_medio_pago: dto.id_medio_pago,
          ubicacion_entrega: dto.ubicacion_entrega ?? null,
          lineas: dto.lineas,
        },
        this.timeoutMinutes,
      );

      this.eventEmitter.emit('order.created', {
        id_pedido: pedido.id_pedido,
        id_vendedor: pedido.id_vendedor,
        id_jornada: pedido.id_jornada,
        expira_el: pedido.expira_el,
      });

      return this.toResponse(pedido, { includeUbicacion: true });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async getOrder(actorId: string, idPedido: string): Promise<OrderResponse> {
    const pedido = await this.ordersRepository.findPedidoById(idPedido);
    if (!pedido) {
      throw new NotFoundException({
        error: 'ORDER_NOT_FOUND',
        message: 'Pedido no encontrado.',
      });
    }

    const esVendedor = pedido.id_vendedor === actorId;
    const esCliente = pedido.id_cliente === actorId;
    if (!esVendedor && !esCliente) {
      throw new NotFoundException({
        error: 'ORDER_NOT_FOUND',
        message: 'Pedido no encontrado.',
      });
    }

    const operativo = pedido.estado === 'solicitado' || pedido.estado === 'en_curso';
    const includeUbicacion = esVendedor && operativo;

    return this.toResponse(pedido, { includeUbicacion });
  }

  async listOrders(
    actorId: string,
    dto: QueryOrdersDto,
  ): Promise<OrderSummaryResponse[]> {
    const limite = dto.limit ?? 20;
    const offset = ((dto.page ?? 1) - 1) * limite;

    const [comoCliente, comoVendedor] = await Promise.all([
      this.ordersRepository.listOrders({
        id_cliente: actorId,
        estado: dto.status,
        limite,
        offset,
      }),
      this.ordersRepository.listOrders({
        id_vendedor: actorId,
        estado: dto.status,
        limite,
        offset,
      }),
    ]);

    const merged = new Map<string, OrderSummaryResponse>();
    for (const row of [...comoCliente, ...comoVendedor]) {
      merged.set(row.id_pedido, {
        id_pedido: row.id_pedido,
        id_vendedor: row.id_vendedor,
        id_cliente: row.id_cliente,
        estado: row.estado,
        total_orden: row.total_orden,
        creado_el: row.creado_el.toISOString(),
        expira_el: row.expira_el ? row.expira_el.toISOString() : null,
        lineas_cantidad: row.lineas_cantidad,
      });
    }

    return Array.from(merged.values());
  }

  async listActiveOrders(idVendedor: string): Promise<OrderSummaryResponse[]> {
    const rows =
      await this.ordersRepository.listActiveOrdersByVendor(idVendedor);
    const ahora = Date.now();
    return rows.map((row) => ({
      id_pedido: row.id_pedido,
      id_vendedor: row.id_vendedor,
      id_cliente: row.id_cliente,
      estado: row.estado,
      total_orden: row.total_orden,
      creado_el: row.creado_el.toISOString(),
      expira_el: row.expira_el ? row.expira_el.toISOString() : null,
      lineas_cantidad: row.lineas_cantidad,
      espera_segundos: Math.max(
        0,
        Math.floor((ahora - row.creado_el.getTime()) / 1000),
      ),
      ubicacion_entrega: row.ubicacion_entrega,
    }));
  }

  async acceptOrder(idVendedor: string, idPedido: string): Promise<OrderResponse> {
    try {
      const pedido = await this.ordersRepository.acceptOrder(idPedido, idVendedor);
      this.eventEmitter.emit('order.accepted', {
        id_pedido: pedido.id_pedido,
        id_cliente: pedido.id_cliente,
        id_vendedor: pedido.id_vendedor,
      });
      return this.toResponse(pedido, { includeUbicacion: true });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async rejectOrder(idVendedor: string, idPedido: string): Promise<OrderResponse> {
    try {
      const pedido = await this.ordersRepository.rejectOrder(idPedido, idVendedor);
      this.eventEmitter.emit('order.rejected', {
        id_pedido: pedido.id_pedido,
        id_cliente: pedido.id_cliente,
        id_vendedor: pedido.id_vendedor,
      });
      this.emitLocationRevoked(pedido.id_pedido, 'rechazado');
      return this.toResponse(pedido, { includeUbicacion: false });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async completeOrder(
    idVendedor: string,
    idPedido: string,
  ): Promise<OrderResponse> {
    try {
      const pedido = await this.ordersRepository.completeOrder(
        idPedido,
        idVendedor,
      );
      this.eventEmitter.emit('order.completed', {
        id_pedido: pedido.id_pedido,
        id_cliente: pedido.id_cliente,
        id_vendedor: pedido.id_vendedor,
      });
      this.emitLocationRevoked(pedido.id_pedido, 'completado');
      return this.toResponse(pedido, { includeUbicacion: false });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async cancelOrder(
    actorId: string,
    idPedido: string,
    motivo: string | null | undefined,
  ): Promise<OrderResponse> {
    try {
      const pedido = await this.ordersRepository.cancelOrder(
        idPedido,
        actorId,
        motivo,
      );
      this.eventEmitter.emit('order.cancelled', {
        id_pedido: pedido.id_pedido,
        cancelado_por: pedido.cancelado_por,
        id_cliente: pedido.id_cliente,
        id_vendedor: pedido.id_vendedor,
      });
      this.emitLocationRevoked(pedido.id_pedido, 'cancelado');
      return this.toResponse(pedido, { includeUbicacion: false });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async closeShiftAndCancelPendingOrders(
    idJornada: string,
    motivo: string,
  ): Promise<CloseShiftResult | null> {
    const result = await this.ordersRepository.closeShiftAndCancelPendingOrders(
      idJornada,
      motivo,
    );
    if (result) {
      for (const pedido of result.cerrados) {
        this.eventEmitter.emit('order.cancelled', {
          id_pedido: pedido.id_pedido,
          cancelado_por: 'vendedor',
          id_cliente: pedido.id_cliente,
          id_vendedor: pedido.id_vendedor,
        });
        this.emitLocationRevoked(pedido.id_pedido, 'cancelado');
      }
      this.eventEmitter.emit('shift.ended', {
        id_jornada: result.id_jornada,
        id_vendedor: result.id_vendedor,
      });
    }
    return result;
  }

  async expireTimedOutOrders(limit = 100): Promise<number> {
    const expirados = await this.ordersRepository.expireTimedOutOrders(limit);
    for (const pedido of expirados) {
      this.eventEmitter.emit('order.expired', {
        id_pedido: pedido.id_pedido,
        id_cliente: pedido.id_cliente,
        id_vendedor: pedido.id_vendedor,
      });
      this.emitLocationRevoked(pedido.id_pedido, 'cancelado');
    }
    return expirados.length;
  }

  private emitLocationRevoked(
    idPedido: string,
    motivo: 'completado' | 'cancelado' | 'rechazado',
  ): void {
    this.eventEmitter.emit('order.revoked', { id_pedido: idPedido, motivo });
  }

  private toResponse(
    pedido: Pedido,
    opts: { includeUbicacion: boolean },
  ): OrderResponse {
    return {
      id_pedido: pedido.id_pedido,
      id_cliente: pedido.id_cliente,
      id_vendedor: pedido.id_vendedor,
      id_jornada: pedido.id_jornada,
      estado: pedido.estado,
      total_orden: pedido.total_orden,
      id_medio_pago: pedido.id_medio_pago,
      creado_el: pedido.creado_el.toISOString(),
      expira_el: pedido.expira_el ? pedido.expira_el.toISOString() : null,
      cancelado_por: pedido.cancelado_por,
      motivo_cancela: pedido.motivo_cancela,
      ubicacion_entrega: opts.includeUbicacion
        ? pedido.ubicacion_entrega
        : null,
      ubicacion_compartida: opts.includeUbicacion && pedido.ubicacion_entrega !== null,
      lineas: pedido.lineas.map((linea) => ({
        id_producto: linea.id_producto,
        cantidad: linea.cantidad,
        precio_historico: linea.precio_historico,
        subtotal: Number((linea.precio_historico * linea.cantidad).toFixed(2)),
      })),
    };
  }

  private rethrow(error: unknown): never {
    if (error instanceof NoActiveShiftError) {
      throw new ConflictException({
        error: 'JOURNEY_NOT_ACTIVE',
        message: error.message,
      });
    }
    if (error instanceof PaymentMethodNotAvailableError) {
      throw new ConflictException({
        error: 'PAYMENT_METHOD_NOT_AVAILABLE',
        message: error.message,
      });
    }
    if (error instanceof ProductNotAvailableError) {
      throw new ConflictException({
        error: 'PRODUCT_NOT_AVAILABLE',
        message: error.message,
      });
    }
    if (error instanceof ProductNotInShiftError) {
      throw new ConflictException({
        error: 'PRODUCT_NOT_IN_SHIFT',
        message: error.message,
      });
    }
    if (error instanceof InsufficientStockError) {
      throw new ConflictException({
        error: 'INSUFFICIENT_STOCK',
        message: error.message,
      });
    }
    if (error instanceof OrderNotFoundError) {
      throw new NotFoundException({
        error: 'ORDER_NOT_FOUND',
        message: error.message,
      });
    }
    if (error instanceof InvalidOrderTransitionError) {
      throw new ConflictException({
        error: 'INVALID_ORDER_TRANSITION',
        message: error.message,
      });
    }
    if (error instanceof OrderExpiredError) {
      throw new ConflictException({
        error: 'ORDER_EXPIRED',
        message: error.message,
      });
    }
    if (error instanceof ConcurrentOperationError) {
      throw new ConflictException({
        error: 'CONCURRENT_OPERATION',
        message: error.message,
      });
    }
    if (error instanceof CancellationReasonRequiredError) {
      throw new BadRequestException({
        error: 'CANCELLATION_REASON_REQUIRED',
        message: error.message,
      });
    }
    throw error;
  }
}
