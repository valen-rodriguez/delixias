import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseJwtAuthGuard } from '../auth/guards/supabase-jwt-auth.guard.js';
import type { AuthUser } from '../auth/strategies/supabase-jwt.strategy.js';
import { MermaDto } from './dto/merma.dto.js';
import { StartShiftDto } from './dto/start-shift.dto.js';
import { ShiftsService } from './shifts.service.js';

interface RequestWithUser extends Request {
  user: AuthUser;
}

@Controller('shifts')
@UseGuards(SupabaseJwtAuthGuard)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get('current')
  getCurrentShift(@Req() req: RequestWithUser) {
    return this.shiftsService.getCurrentShift(req.user.id_usuario);
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  startShift(
    @Req() req: RequestWithUser,
    @Body() dto: StartShiftDto,
  ) {
    return this.shiftsService.startShift(req.user.id_usuario, dto);
  }

  @Post('end')
  @HttpCode(HttpStatus.OK)
  endShift(@Req() req: RequestWithUser) {
    return this.shiftsService.endShift(req.user.id_usuario);
  }

  @Post('merma')
  @HttpCode(HttpStatus.OK)
  registerMerma(
    @Req() req: RequestWithUser,
    @Body() dto: MermaDto,
  ) {
    return this.shiftsService.registerMerma(
      req.user.id_usuario,
      dto.id_producto,
      dto.cantidad,
      dto.motivo,
    );
  }
}
