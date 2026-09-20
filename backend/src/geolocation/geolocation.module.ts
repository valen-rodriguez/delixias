import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../infra/database.module.js';
import { GeolocationController } from './geolocation.controller.js';
import { GeolocationGateway } from './geolocation.gateway.js';
import { GeolocationRepository } from './geolocation.repository.js';
import { GeolocationService } from './geolocation.service.js';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [GeolocationController],
  providers: [GeolocationService, GeolocationRepository, GeolocationGateway, WsJwtGuard],
  exports: [GeolocationGateway],
})
export class GeolocationModule {}
