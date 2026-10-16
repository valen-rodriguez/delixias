import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListVendorsQueryDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit: number = 20;

  @IsOptional()
  @IsIn(['activo', 'suspendido', 'pendiente_revision', 'bloqueado', 'no_solicitado'])
  estado_vendedor?: 'activo' | 'suspendido' | 'pendiente_revision' | 'bloqueado' | 'no_solicitado';

  @IsOptional()
  @IsString()
  q?: string;
}
