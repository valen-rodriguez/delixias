import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { IsSupabaseStorageUrl } from '../../common/decorators/is-supabase-storage-url.decorator.js';

export class CreateProductDto {
  @IsInt()
  @IsNotEmpty()
  id_categoria: number;

  @IsString()
  @IsNotEmpty({ message: 'El nombre del producto es obligatorio.' })
  @Matches(/^.{1,100}$/, { message: 'El nombre no puede superar 100 caracteres.' })
  nombre: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'El precio unitario debe ser mayor a 0.' })
  precio_unitario: number;

  @IsInt()
  @Min(0)
  stock_base: number;

  @IsOptional()
  @IsString()
  @IsSupabaseStorageUrl({ allowedBuckets: ['productos'] })
  foto_url?: string | null;
}