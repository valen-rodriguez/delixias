import { IsString, IsNotEmpty, Matches, ValidateIf } from 'class-validator';
import { IsSupabaseStorageUrl } from '../../common/decorators/is-supabase-storage-url.decorator.js';

export class UpgradeToSellerDto {
  @IsString()
  @IsNotEmpty({ message: 'El DNI es obligatorio para operar como vendedor.' })
  @Matches(/^[0-9]{7,9}$/, {
    message: 'El DNI debe tener un formato numérico válido de 7 a 9 dígitos.',
  })
  dni: string;

  @IsString()
  @IsNotEmpty({ message: 'La dirección real de domicilio es obligatoria.' })
  direccion: string;

  @ValidateIf((o) => o.foto_perfil_url !== undefined)
  @IsString()
  @IsSupabaseStorageUrl({
    allowedBuckets: ['avatares', 'documentos-verificacion'],
  })
  foto_perfil_url: string;
}
