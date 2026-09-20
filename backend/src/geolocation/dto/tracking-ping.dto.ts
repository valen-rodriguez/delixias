import { IsNotEmpty, IsOptional, IsISO8601 } from 'class-validator';
import { IsLatArgentina, IsLngArgentina } from '../../common/decorators/is-argentina-coordinate.decorator.js';

export class TrackingPingDto {
  @IsNotEmpty({ message: 'La latitud es obligatoria.' })
  @IsLatArgentina({ message: 'La latitud está fuera del área de cobertura.' })
  lat: number;

  @IsNotEmpty({ message: 'La longitud es obligatoria.' })
  @IsLngArgentina({ message: 'La longitud está fuera del área de cobertura.' })
  lng: number;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'timestamp_medicion debe ser ISO-8601.' })
  timestamp_medicion?: string;
}
