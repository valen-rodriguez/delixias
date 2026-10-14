import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseJwtAuthGuard } from '../auth/guards/supabase-jwt-auth.guard.js';
import type { AuthUser } from '../auth/strategies/supabase-jwt.strategy.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { QueryOrdersDto } from './dto/query-orders.dto.js';
import { RejectOrderDto } from './dto/reject-order.dto.js';
import { OrdersService } from './orders.service.js';

interface RequestWithUser extends Request {
  user: AuthUser;
}

@Controller('orders')
@UseGuards(SupabaseJwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createOrder(@Req() req: RequestWithUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(req.user.id_usuario, dto);
  }

  @Get()
  listOrders(@Req() req: RequestWithUser, @Query() dto: QueryOrdersDto) {
    return this.ordersService.listOrders(req.user.id_usuario, dto);
  }

  @Get('vendor/active')
  listActiveOrders(@Req() req: RequestWithUser) {
    return this.ordersService.listActiveOrders(req.user.id_usuario);
  }

  @Get(':id')
  getOrder(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.getOrder(req.user.id_usuario, id);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  acceptOrder(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.acceptOrder(req.user.id_usuario, id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  rejectOrder(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: RejectOrderDto,
  ) {
    return this.ordersService.rejectOrder(req.user.id_usuario, id);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  completeOrder(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.completeOrder(req.user.id_usuario, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelOrder(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrder(
      req.user.id_usuario,
      id,
      dto.motivo,
    );
  }
}
