import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

const ESTADOS = [
  'solicitado',
  'en_curso',
  'completado',
  'rechazado',
  'cancelado',
];

export class QueryOrdersDto {
  @IsOptional()
  @IsIn(ESTADOS)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
