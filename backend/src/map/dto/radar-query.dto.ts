import { IsOptional, IsInt, Min } from 'class-validator';
import { IsLatArgentina, IsLngArgentina } from '../../common/decorators/is-argentina-coordinate.decorator.js';

export class RadarQueryDto {
  @IsLatArgentina({ message: 'La latitud está fuera del área de cobertura.' })
  lat: number;

  @IsLngArgentina({ message: 'La longitud está fuera del área de cobertura.' })
  lng: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  categoria?: number;
}
