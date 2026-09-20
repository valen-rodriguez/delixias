import { IsNotEmpty } from 'class-validator';
import { IsLatArgentina, IsLngArgentina } from '../../common/decorators/is-argentina-coordinate.decorator.js';

export class VendorDetailQueryDto {
  @IsNotEmpty({ message: 'La latitud es obligatoria.' })
  @IsLatArgentina({ message: 'La latitud está fuera del área de cobertura.' })
  lat: number;

  @IsNotEmpty({ message: 'La longitud es obligatoria.' })
  @IsLngArgentina({ message: 'La longitud está fuera del área de cobertura.' })
  lng: number;
}
