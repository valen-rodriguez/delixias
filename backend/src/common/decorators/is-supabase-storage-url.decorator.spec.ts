import { validate } from 'class-validator';
import { IsSupabaseStorageUrl } from './is-supabase-storage-url.decorator.js';

class TestDto {
  @IsSupabaseStorageUrl({
    allowedBuckets: ['avatares', 'documentos-verificacion'],
  })
  foto_perfil_url: string;
}

class ProductDto {
  @IsSupabaseStorageUrl({
    allowedBuckets: ['productos'],
  })
  foto_url: string;
}

describe('IsSupabaseStorageUrl', () => {
  const base = 'https://wyrjgmzsnixpqydvrmrw.supabase.co';

  it.each([
    `${base}/storage/v1/object/public/avatares/30123456.jpg`,
    `${base}/storage/v1/object/public/documentos-verificacion/30123456-v2.jpg`,
  ])('acepta URL válida: %s', async (url) => {
    const dto = new TestDto();
    dto.foto_perfil_url = url;
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it.each([
    'https://google.com/hacker.jpg',
    `${base}/storage/v1/object/public/otro-bucket/30123456.jpg`,
    'not-a-url',
    `${base}/storage/v1/object/admin/public/avatares/30123456.jpg`,
    12345,
  ])('rechaza URL inválida: %s', async (url) => {
    const dto = new TestDto();
    dto.foto_perfil_url = url as never;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('acepta URL del bucket productos (catálogo)', async () => {
    const dto = new ProductDto();
    dto.foto_url = `${base}/storage/v1/object/public/productos/empanada.jpg`;
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rechaza URL de otro bucket en catálogo y el mensaje lista productos', async () => {
    const dto = new ProductDto();
    dto.foto_url = `${base}/storage/v1/object/public/avatares/30123456.jpg`;
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toMatchObject({
      IsSupabaseStorageUrl: expect.stringContaining('productos'),
    });
  });
});
