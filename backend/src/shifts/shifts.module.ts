import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from '../auth/auth.module.js';
import { ShiftsController } from './shifts.controller.js';
import { ShiftsRepository } from './shifts.repository.js';
import { ShiftsService } from './shifts.service.js';

@Module({
  imports: [AuthModule, EventEmitterModule.forRoot()],
  controllers: [ShiftsController],
  providers: [ShiftsService, ShiftsRepository],
})
export class ShiftsModule {}
