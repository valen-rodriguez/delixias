import {
  Injectable,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  UsersRepository,
  DuplicatedDniError,
  AlreadyActiveError,
  InvalidStateError,
  VendedorNotActiveError,
  UserNotFoundError,
} from './users.repository.js';
import type { RolOperativo, SanitizedProfile } from './entities/user.entity.js';

function sanitize(user: {
  id_usuario: string;
  email: string;
  nombre_completo: string;
  telefono: string;
  direccion: string | null;
  dni: string | null;
  foto_perfil_url: string | null;
  estado_vendedor: SanitizedProfile['estado_vendedor'];
  motivo_suspension: string | null;
  ultimo_rol_activo: RolOperativo;
}): SanitizedProfile {
  return {
    id_usuario: user.id_usuario,
    email: user.email,
    nombre_completo: user.nombre_completo,
    telefono: user.telefono,
    direccion: user.direccion,
    dni: user.dni,
    foto_perfil_url: user.foto_perfil_url,
    estado_vendedor: user.estado_vendedor,
    motivo_suspension: user.motivo_suspension,
    ultimo_rol_activo: user.ultimo_rol_activo,
  };
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly usersRepo: UsersRepository) {}

  async getProfile(idUsuario: string): Promise<SanitizedProfile> {
    const user = await this.usersRepo.findById(idUsuario);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return sanitize(user);
  }

  async upgradeToSeller(
    idUsuario: string,
    data: {
      dni: string;
      direccion: string;
      foto_perfil_url: string;
    },
  ): Promise<SanitizedProfile> {
    try {
      this.logger.log(`Upgrade to seller requested for user ${idUsuario}`);
      await this.usersRepo.upgradeToSeller(idUsuario, data);
      this.logger.log(`User ${idUsuario} upgraded to seller successfully`);
    } catch (error) {
      if (error instanceof DuplicatedDniError) {
        throw new ConflictException({
          error: 'DNI_ALREADY_IN_USE',
          message: error.message,
        });
      }
      if (error instanceof AlreadyActiveError) {
        throw new ConflictException({
          error: 'ALREADY_ACTIVE',
          message: error.message,
        });
      }
      if (error instanceof UserNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
    return this.getProfile(idUsuario);
  }

  async reappealDocumentation(
    idUsuario: string,
    nuevaFotoUrl: string,
  ): Promise<SanitizedProfile> {
    try {
      this.logger.log(`Reappeal documentation requested for user ${idUsuario}`);
      await this.usersRepo.reappealDocumentation(idUsuario, nuevaFotoUrl);
      this.logger.log(`User ${idUsuario} moved to pendiente_revision`);
    } catch (error) {
      if (error instanceof InvalidStateError) {
        throw new ConflictException({
          error: 'INVALID_STATE',
          message: error.message,
        });
      }
      if (error instanceof UserNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
    return this.getProfile(idUsuario);
  }

  async switchRole(
    idUsuario: string,
    rol: RolOperativo,
  ): Promise<SanitizedProfile> {
    try {
      this.logger.log(`Switch role to ${rol} requested for user ${idUsuario}`);
      await this.usersRepo.switchRole(idUsuario, rol);
      this.logger.log(`User ${idUsuario} switched to ${rol} successfully`);
    } catch (error) {
      if (error instanceof VendedorNotActiveError) {
        throw new ForbiddenException({
          error: 'VENDEDOR_NOT_ACTIVE',
          message: error.message,
        });
      }
      if (error instanceof UserNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
    return this.getProfile(idUsuario);
  }
}
