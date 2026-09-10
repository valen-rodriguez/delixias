import { IsIn, IsNotEmpty } from 'class-validator';
import type { RolOperativo } from '../entities/user.entity.js';

export class SwitchRoleDto {
  @IsNotEmpty()
  @IsIn(['cliente', 'vendedor'], {
    message: 'El rol activo solo puede ser cliente o vendedor.',
  })
  rol: RolOperativo;
}
