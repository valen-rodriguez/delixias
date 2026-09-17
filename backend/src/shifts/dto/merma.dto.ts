import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class MermaDto {
  @IsNotEmpty({ message: 'El id del producto es obligatorio.' })
  id_producto: string;

  @IsInt()
  @Min(1, { message: 'La cantidad de merma debe ser al menos 1.' })
  cantidad: number;

  @IsString()
  @IsNotEmpty({ message: 'El motivo de la merma es obligatorio.' })
  @MaxLength(200, { message: 'El motivo no puede superar 200 caracteres.' })
  motivo: string;
}
