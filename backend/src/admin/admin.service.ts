import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AdminRepository,
  AlreadyBlockedError,
  AlreadySuspendedError,
  InvalidStateError,
  ParameterNotFoundError,
  UserNotFoundError,
  VendorNotRegisteredError,
} from './admin.repository.js';
import { ShiftsRepository } from '../shifts/shifts.repository.js';
import { OrdersService } from '../orders/orders.service.js';
import { RedisGeoService } from '../infra/redis-geo.service.js';

const NUMERIC_PARAMETER_KEYS = new Set([
  'radio_cobertura_km',
  'timeout_pedido_min',
  'timeout_jornada_inactividad_horas',
  'anonimizacion_horas_ubicacion',
]);

@Injectable()
export class AdminService {
  constructor(
    private readonly adminRepo: AdminRepository,
    private readonly shiftsRepo: ShiftsRepository,
    private readonly ordersService: OrdersService,
    private readonly redisGeo: RedisGeoService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getVendors(page: number, limit: number, estado_vendedor?: string, q?: string) {
    return this.adminRepo.findVendors(page, limit, estado_vendedor, q);
  }

  async getVendorById(id: string) {
    const vendor = await this.adminRepo.findVendorById(id);
    if (!vendor) {
      throw new NotFoundException('Vendedor no encontrado');
    }
    return vendor;
  }

  async suspendVendor(idUsuario: string, motivo: string, actorId: string) {
    try {
      const currentShift = await this.shiftsRepo.findCurrentShift(idUsuario);
      const idJornada = currentShift?.id_jornada ?? null;

      if (idJornada) {
        await this.ordersService.closeShiftAndCancelPendingOrders(idJornada, motivo);
      }

      const updated = await this.adminRepo.suspendVendor(idUsuario, motivo, actorId);
      return {
        id_usuario: updated.id_usuario,
        estado_vendedor: updated.estado_vendedor,
        motivo_suspension: updated.motivo_suspension,
      };
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw new NotFoundException('Usuario no encontrado');
      }
      if (error instanceof VendorNotRegisteredError) {
        throw new ConflictException('VENDOR_NOT_REGISTERED');
      }
      if (error instanceof AlreadySuspendedError) {
        throw new ConflictException('ALREADY_SUSPENDED');
      }
      if (error instanceof AlreadyBlockedError) {
        throw new ConflictException('ALREADY_BLOCKED');
      }
      if (error instanceof InvalidStateError) {
        throw new ConflictException('INVALID_STATE');
      }
      throw error;
    }
  }

  async approveVendor(idUsuario: string, motivo: string | undefined, actorId: string) {
    try {
      const updated = await this.adminRepo.approveVendor(idUsuario, motivo, actorId);
      return {
        id_usuario: updated.id_usuario,
        estado_vendedor: updated.estado_vendedor,
      };
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw new NotFoundException('Usuario no encontrado');
      }
      if (error instanceof InvalidStateError) {
        throw new ConflictException('INVALID_STATE');
      }
      throw error;
    }
  }

  async rejectVendor(idUsuario: string, motivo: string, actorId: string) {
    try {
      const updated = await this.adminRepo.rejectVendor(idUsuario, motivo, actorId);
      return {
        id_usuario: updated.id_usuario,
        estado_vendedor: updated.estado_vendedor,
        motivo_suspension: updated.motivo_suspension,
      };
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw new NotFoundException('Usuario no encontrado');
      }
      if (error instanceof InvalidStateError) {
        throw new ConflictException('INVALID_STATE');
      }
      throw error;
    }
  }

  async blockVendor(idUsuario: string, motivo: string, actorId: string) {
    try {
      const currentShift = await this.shiftsRepo.findCurrentShift(idUsuario);
      const idJornada = currentShift?.id_jornada ?? null;

      if (idJornada) {
        await this.ordersService.closeShiftAndCancelPendingOrders(idJornada, motivo);
      }

      const updated = await this.adminRepo.blockVendor(idUsuario, motivo, actorId);
      return {
        id_usuario: updated.id_usuario,
        estado_vendedor: updated.estado_vendedor,
        motivo_suspension: updated.motivo_suspension,
      };
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw new NotFoundException('Usuario no encontrado');
      }
      if (error instanceof VendorNotRegisteredError) {
        throw new ConflictException('VENDOR_NOT_REGISTERED');
      }
      if (error instanceof AlreadyBlockedError) {
        throw new ConflictException('ALREADY_BLOCKED');
      }
      if (error instanceof InvalidStateError) {
        throw new ConflictException('INVALID_STATE');
      }
      throw error;
    }
  }

  async getParameters() {
    return this.adminRepo.getParameters();
  }

  async updateParameter(clave: string, valor: string, actorId: string) {
    if (NUMERIC_PARAMETER_KEYS.has(clave)) {
      const parsed = Number(valor);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new BadRequestException({
          error: 'VALIDATION_ERROR',
          message: 'El valor debe ser un número mayor a 0.',
        });
      }
    }

    try {
      const updated = await this.adminRepo.updateParameter(clave, valor, actorId);
      await this.redisGeo.set(`param:${clave}`, valor);
      return updated;
    } catch (error) {
      if (error instanceof ParameterNotFoundError) {
        throw new NotFoundException('Parametro no encontrado');
      }
      throw error;
    }
  }

  async getOrders(page: number, limit: number, estado?: string, id_vendedor?: string, fecha_desde?: string, fecha_hasta?: string) {
    return this.adminRepo.getOrders(page, limit, estado, id_vendedor, fecha_desde, fecha_hasta);
  }

  async getShifts(page: number, limit: number, estado?: string, id_vendedor?: string, fecha_desde?: string, fecha_hasta?: string) {
    return this.adminRepo.getShifts(page, limit, estado, id_vendedor, fecha_desde, fecha_hasta);
  }
}
