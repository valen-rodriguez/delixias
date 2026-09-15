import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseJwtAuthGuard } from '../auth/guards/supabase-jwt-auth.guard.js';
import type { AuthUser } from '../auth/strategies/supabase-jwt.strategy.js';
import { CatalogService } from './catalog.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

interface RequestWithUser extends Request {
  user: AuthUser;
}

@Controller()
@UseGuards(SupabaseJwtAuthGuard)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('categories')
  getCategories() {
    return this.catalogService.listCategories();
  }

  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  createProduct(
    @Req() req: RequestWithUser,
    @Body() dto: CreateProductDto,
  ) {
    return this.catalogService.createProduct(req.user.id_usuario, dto);
  }

  @Get('products/me')
  getMyProducts(
    @Req() req: RequestWithUser,
    @Query('incluye_inactivos') incluyeInactivos?: string,
  ) {
    return this.catalogService.listMyProducts(
      req.user.id_usuario,
      incluyeInactivos === 'true',
    );
  }

  @Patch('products/:idProducto')
  @HttpCode(HttpStatus.OK)
  updateProduct(
    @Req() req: RequestWithUser,
    @Param('idProducto', ParseUUIDPipe) idProducto: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalogService.updateProduct(
      idProducto,
      req.user.id_usuario,
      dto,
    );
  }

  @Delete('products/:idProducto')
  @HttpCode(HttpStatus.OK)
  deleteProduct(
    @Req() req: RequestWithUser,
    @Param('idProducto', ParseUUIDPipe) idProducto: string,
  ) {
    return this.catalogService.deleteProduct(req.user.id_usuario, idProducto);
  }
}