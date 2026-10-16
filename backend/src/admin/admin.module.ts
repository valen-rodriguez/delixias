import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ShiftsModule } from '../shifts/shifts.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { AdminController } from './admin.controller.js';
import { AdminRepository } from './admin.repository.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [AuthModule, ShiftsModule, OrdersModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository],
})
export class AdminModule {}
