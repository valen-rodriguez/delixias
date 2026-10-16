import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../../auth/strategies/supabase-jwt.strategy.js';
import { AuthGuard } from '@nestjs/passport';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';

export interface SuperAdminRequest extends Request {
  superAdmin: {
    id_super_admin: string;
    id_usuario: string;
    activo: boolean;
  };
}

@Injectable()
export class SuperAdminGuard extends AuthGuard('supabase-jwt') implements CanActivate {
  constructor(@Inject('DATABASE_POOL') private readonly pool: Pool) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const baseCanActivate = await super.canActivate(context);
    if (!baseCanActivate) {
      throw new UnauthorizedException('No autorizado');
    }

    const request = context.switchToHttp().getRequest<SuperAdminRequest>();
    const user = request.user as AuthUser;

    if (!user || !user.id_usuario) {
      throw new UnauthorizedException('No autorizado');
    }

    const result = await this.pool.query(
      'SELECT id_super_admin, id_usuario, activo FROM public.super_admins WHERE id_usuario = $1',
      [user.id_usuario],
    );

    if (result.rows.length === 0) {
      throw new ForbiddenException('Acceso solo para Super Admin');
    }

    const superAdmin = result.rows[0];
    if (!superAdmin.activo) {
      throw new ForbiddenException('Acceso solo para Super Admin');
    }

    request.superAdmin = {
      id_super_admin: superAdmin.id_super_admin,
      id_usuario: superAdmin.id_usuario,
      activo: superAdmin.activo,
    };

    return true;
  }
}
