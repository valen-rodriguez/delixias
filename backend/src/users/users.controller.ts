import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseJwtAuthGuard } from '../auth/guards/supabase-jwt-auth.guard.js';
import type { AuthUser } from '../auth/strategies/supabase-jwt.strategy.js';
import { UsersService } from './users.service.js';
import { UpgradeToSellerDto } from './dto/upgrade-to-seller.dto.js';
import { ReappealDocumentationDto } from './dto/reappeal-documentation.dto.js';
import { SwitchRoleDto } from './dto/switch-role.dto.js';
import type { SanitizedProfile } from './entities/user.entity.js';

interface RequestWithUser extends Request {
  user: AuthUser;
}

@Controller('users')
@UseGuards(SupabaseJwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getProfile(@Req() req: RequestWithUser): Promise<SanitizedProfile> {
    return this.usersService.getProfile(req.user.id_usuario);
  }

  @Post('upgrade-to-seller')
  @HttpCode(HttpStatus.OK)
  upgradeToSeller(
    @Req() req: RequestWithUser,
    @Body() dto: UpgradeToSellerDto,
  ): Promise<SanitizedProfile> {
    return this.usersService.upgradeToSeller(req.user.id_usuario, dto);
  }

  @Post('reappeal-documentation')
  @HttpCode(HttpStatus.OK)
  reappealDocumentation(
    @Req() req: RequestWithUser,
    @Body() dto: ReappealDocumentationDto,
  ): Promise<SanitizedProfile> {
    return this.usersService.reappealDocumentation(
      req.user.id_usuario,
      dto.nueva_foto_perfil_url,
    );
  }

  @Patch('switch-role')
  switchRole(
    @Req() req: RequestWithUser,
    @Body() dto: SwitchRoleDto,
  ): Promise<SanitizedProfile> {
    return this.usersService.switchRole(req.user.id_usuario, dto.rol);
  }
}
