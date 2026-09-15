import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ShiftsController } from './shifts.controller.js';
import { ShiftsRepository } from './shifts.repository.js';
import { ShiftsService } from './shifts.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ShiftsController],
  providers: [ShiftsService, ShiftsRepository],
})
export class ShiftsModule {}