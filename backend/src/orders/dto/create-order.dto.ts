import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsLatArgentina, IsLngArgentina } from '../../common/decorators/is-argentina-coordinate.decorator.js';

export class OrderLineDto {
  @IsUUID('4')
  @IsNotEmpty()
  id_producto: string;

  @IsInt()
  @Min(1)
  cantidad: number;
}

export class UbicacionEntregaDto {
  @IsNotEmpty({ message: 'La latitud es obligatoria.' })
  @IsLatArgentina({ message: 'La latitud está fuera del área de cobertura.' })
  lat: number;

  @IsNotEmpty({ message: 'La longitud es obligatoria.' })
  @IsLngArgentina({ message: 'La longitud está fuera del área de cobertura.' })
  lng: number;
}

export class CreateOrderDto {
  @IsUUID('4')
  @IsNotEmpty()
  id_vendedor: string;

  @IsInt()
  @IsNotEmpty()
  id_medio_pago: number;

  @IsObject()
  @ValidateNested()
  @Type(() => UbicacionEntregaDto)
  ubicacion_entrega: UbicacionEntregaDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  lineas: OrderLineDto[];
}
