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
import { TrackingPingDto } from './dto/tracking-ping.dto.js';
import { GeolocationService } from './geolocation.service.js';

interface RequestWithUser extends Request {
  user: AuthUser;
}

@Controller('shifts')
@UseGuards(SupabaseJwtAuthGuard)
export class GeolocationController {
  constructor(private readonly geolocationService: GeolocationService) {}

  @Post('tracking')
  @HttpCode(HttpStatus.OK)
  trackPing(
    @Req() req: RequestWithUser,
    @Body() dto: TrackingPingDto,
  ) {
    return this.geolocationService.trackPing(req.user.id_usuario, dto);
  }

  @Get('tracking-status')
  getTrackingStatus(@Req() req: RequestWithUser) {
    return this.geolocationService.getTrackingStatus(req.user.id_usuario);
  }
}
