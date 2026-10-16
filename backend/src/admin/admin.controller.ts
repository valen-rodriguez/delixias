import { Controller, Get, Patch, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { SuperAdminGuard } from './guards/super-admin.guard.js';
import type { SuperAdminRequest } from './guards/super-admin.guard.js';
import type { ListVendorsQueryDto } from './dto/list-vendors-query.dto.js';
import type { ListOrdersQueryDto } from './dto/list-orders-query.dto.js';
import type { ListShiftsQueryDto } from './dto/list-shifts-query.dto.js';
import type { VendorDetailParamsDto } from './dto/vendor-detail.params.dto.js';
import type { SuspendVendorDto } from './dto/suspend-vendor.dto.js';
import type { ApproveVendorDto } from './dto/approve-vendor.dto.js';
import type { RejectVendorDto } from './dto/reject-vendor.dto.js';
import type { BlockVendorDto } from './dto/block-vendor.dto.js';
import type { UpdateSystemParameterDto } from './dto/update-system-parameter.dto.js';
import type { UpdateSystemParameterParamsDto } from './dto/update-system-parameter.params.dto.js';

@UseGuards(SuperAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('vendors')
  async getVendors(@Query() query: ListVendorsQueryDto) {
    return this.adminService.getVendors(query.page, query.limit, query.estado_vendedor, query.q);
  }

  @Get('vendors/:id')
  async getVendorById(@Param() params: VendorDetailParamsDto) {
    return this.adminService.getVendorById(params.id);
  }

  @Patch('vendors/:id/suspend')
  async suspendVendor(@Param('id') id: string, @Body() dto: SuspendVendorDto, @Req() req: SuperAdminRequest) {
    return this.adminService.suspendVendor(id, dto.motivo, req.superAdmin.id_super_admin);
  }

  @Patch('vendors/:id/approve')
  async approveVendor(@Param('id') id: string, @Body() dto: ApproveVendorDto, @Req() req: SuperAdminRequest) {
    return this.adminService.approveVendor(id, dto.motivo, req.superAdmin.id_super_admin);
  }

  @Patch('vendors/:id/reject')
  async rejectVendor(@Param('id') id: string, @Body() dto: RejectVendorDto, @Req() req: SuperAdminRequest) {
    return this.adminService.rejectVendor(id, dto.motivo, req.superAdmin.id_super_admin);
  }

  @Patch('vendors/:id/block')
  async blockVendor(@Param('id') id: string, @Body() dto: BlockVendorDto, @Req() req: SuperAdminRequest) {
    return this.adminService.blockVendor(id, dto.motivo, req.superAdmin.id_super_admin);
  }

  @Get('parameters')
  async getParameters() {
    return this.adminService.getParameters();
  }

  @Patch('parameters/:clave')
  async updateParameter(
    @Param() params: UpdateSystemParameterParamsDto,
    @Body() dto: UpdateSystemParameterDto,
    @Req() req: SuperAdminRequest,
  ) {
    return this.adminService.updateParameter(params.clave, dto.valor, req.superAdmin.id_super_admin);
  }

  @Get('orders')
  async getOrders(@Query() query: ListOrdersQueryDto) {
    return this.adminService.getOrders(query.page, query.limit, query.estado, query.id_vendedor, query.fecha_desde, query.fecha_hasta);
  }

  @Get('shifts')
  async getShifts(@Query() query: ListShiftsQueryDto) {
    return this.adminService.getShifts(query.page, query.limit, query.estado, query.id_vendedor, query.fecha_desde, query.fecha_hasta);
  }
}
