import { IsInt, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { IsSupabaseStorageUrl } from '../../common/decorators/is-supabase-storage-url.decorator.js';

export class UpdateProductDto {
  @IsOptional() @IsString() @Matches(/^.{1,100}$/, { message: 'El nombre no puede superar 100 caracteres.' }) nombre?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01, { message: 'El precio unitario debe ser mayor a 0.' }) precio_unitario?: number;
  @IsOptional() @IsInt() @Min(0) stock_base?: number;
  @IsOptional() @IsString() @IsSupabaseStorageUrl({ allowedBuckets: ['productos'] }) foto_url?: string | null;
}