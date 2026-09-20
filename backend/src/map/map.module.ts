import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MapController } from './map.controller.js';
import { MapRepository } from './map.repository.js';
import { MapService } from './map.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MapController],
  providers: [MapService, MapRepository],
})
export class MapModule {}
