import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { StartShiftDto } from './dto/start-shift.dto.js';
import type { CurrentShiftResponse, MermaResponse } from './entities/jornada.entity.js';
import {
  MermaExceedsStockError,
  NoActiveShiftError,
  NoStockAvailableError,
  ProductNotInJornadaError,
  ShiftAlreadyActiveError,
  ShiftHasPendingOrdersError,
  ShiftsRepository,
  VendedorNotActiveError,
} from './shifts.repository.js';

@Injectable()
export class ShiftsService {
  constructor(
    private readonly shiftsRepository: ShiftsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getCurrentShift(
    idVendedor: string,
  ): Promise<CurrentShiftResponse | null> {
    return this.shiftsRepository.findCurrentShift(idVendedor);
  }

  async startShift(
    idVendedor: string,
    dto: StartShiftDto,
  ): Promise<CurrentShiftResponse> {
    try {
      return await this.shiftsRepository.startShift(idVendedor, dto);
    } catch (error) {
      if (error instanceof VendedorNotActiveError) {
        throw new ForbiddenException({
          error: 'VENDOR_NOT_ACTIVE',
          message: error.message,
        });
      }
      if (error instanceof NoStockAvailableError) {
        throw new BadRequestException({
          error: 'NO_STOCK_AVAILABLE',
          message: error.message,
        });
      }
      if (error instanceof ShiftAlreadyActiveError) {
        throw new ConflictException({
          error: 'SHIFT_ALREADY_ACTIVE',
          message: error.message,
        });
      }
      throw error;
    }
  }

  async endShift(idVendedor: string): Promise<CurrentShiftResponse> {
    try {
      const result = await this.shiftsRepository.endShift(idVendedor);
      this.eventEmitter.emit('shift.ended', {
        id_jornada: result.id_jornada,
        id_vendedor: idVendedor,
      });
      return result;
    } catch (error) {
      if (error instanceof ShiftHasPendingOrdersError) {
        throw new ConflictException({
          error: 'SHIFT_HAS_PENDING_ORDERS',
          message: error.message,
        });
      }
      if (error instanceof NoActiveShiftError) {
        throw new ConflictException({
          error: 'NO_ACTIVE_SHIFT',
          message: error.message,
        });
      }
      throw error;
    }
  }

  async registerMerma(
    idVendedor: string,
    idProducto: string,
    cantidad: number,
    motivo: string,
  ): Promise<MermaResponse> {
    try {
      return await this.shiftsRepository.registerMerma(
        idVendedor,
        idProducto,
        cantidad,
        motivo,
      );
    } catch (error) {
      if (error instanceof NoActiveShiftError) {
        throw new ConflictException({
          error: 'NO_ACTIVE_SHIFT',
          message: error.message,
        });
      }
      if (error instanceof ProductNotInJornadaError) {
        throw new NotFoundException({
          error: 'PRODUCT_NOT_FOUND_EN_JORNADA',
          message: error.message,
        });
      }
      if (error instanceof MermaExceedsStockError) {
        throw new BadRequestException({
          error: 'MERMA_EXCEEDS_STOCK',
          message: error.message,
        });
      }
      throw error;
    }
  }
}
