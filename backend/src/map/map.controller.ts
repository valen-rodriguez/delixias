import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupabaseJwtAuthGuard } from '../auth/guards/supabase-jwt-auth.guard.js';
import { RadarQueryDto } from './dto/radar-query.dto.js';
import { VendorDetailQueryDto } from './dto/vendor-detail-query.dto.js';
import { MapService } from './map.service.js';

@Controller('map')
@UseGuards(SupabaseJwtAuthGuard)
export class MapController {
  constructor(private readonly mapService: MapService) {}

  @Get('vendors')
  getRadar(@Query() query: RadarQueryDto) {
    return this.mapService.getRadar(query);
  }

  @Get('vendors/:id')
  getVendorDetail(
    @Param('id') id: string,
    @Query() query: VendorDetailQueryDto,
  ) {
    return this.mapService.getVendorDetail(id, query.lng, query.lat);
  }
}
