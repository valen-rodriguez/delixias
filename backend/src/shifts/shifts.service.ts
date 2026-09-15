import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { StartShiftDto } from './dto/start-shift.dto.js';
import type { CurrentShiftResponse } from './entities/jornada.entity.js';
import {
  NoActiveShiftError,
  NoStockAvailableError,
  ShiftAlreadyActiveError,
  ShiftHasPendingOrdersError,
  ShiftsRepository,
  VendedorNotActiveError,
} from './shifts.repository.js';

@Injectable()
export class ShiftsService {
  constructor(private readonly shiftsRepository: ShiftsRepository) {}

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
      return await this.shiftsRepository.endShift(idVendedor);
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
}