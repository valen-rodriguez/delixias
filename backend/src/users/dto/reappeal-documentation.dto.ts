import { IsNotEmpty, IsString } from 'class-validator';
import { IsSupabaseStorageUrl } from '../../common/decorators/is-supabase-storage-url.decorator.js';

export class ReappealDocumentationDto {
  @IsString()
  @IsNotEmpty({ message: 'La URL de la documentación es obligatoria.' })
  @IsSupabaseStorageUrl({
    allowedBuckets: ['avatares', 'documentos-verificacion'],
  })
  nueva_foto_perfil_url: string;
}
