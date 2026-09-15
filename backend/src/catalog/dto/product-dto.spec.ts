import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto.js';
import { UpdateProductDto } from './update-product.dto.js';

const BASE = 'https://wyrjgmzsnixpqydvrmrw.supabase.co/storage/v1/object';
const PRODUCT_URL = `${BASE}/public/productos/empanada.jpg`;

function makeCreate(
  overrides: Partial<CreateProductDto> = {},
): CreateProductDto {
  return Object.assign(new CreateProductDto(), {
    id_categoria: 2,
    nombre: 'Empanada a caballo',
    precio_unitario: 1200.5,
    stock_base: 40,
    foto_url: PRODUCT_URL,
    ...overrides,
  });
}

describe('CreateProductDto', () => {
  it('acepta un body válido', async () => {
    const errors = await validate(makeCreate());
    expect(errors).toHaveLength(0);
  });

  it('rechaza nombre vacío', async () => {
    const errors = await validate(makeCreate({ nombre: '' }));
    expect(
      errors.some((e) =>
        Object.values(e.constraints ?? {}).includes(
          'El nombre del producto es obligatorio.',
        ),
      ),
    ).toBe(true);
  });

  it('rechaza nombre de más de 100 caracteres', async () => {
    const errors = await validate(
      makeCreate({ nombre: 'a'.repeat(101) }),
    );
    expect(
      errors.some((e) =>
        Object.values(e.constraints ?? {}).includes(
          'El nombre no puede superar 100 caracteres.',
        ),
      ),
    ).toBe(true);
  });

  it('rechaza precio unitario 0 o negativo', async () => {
    for (const precio_unitario of [0, -5]) {
      const errors = await validate(makeCreate({ precio_unitario }));
      expect(
        errors.some((e) =>
          Object.values(e.constraints ?? {}).includes(
            'El precio unitario debe ser mayor a 0.',
          ),
        ),
      ).toBe(true);
    }
  });

  it('rechaza stock_base negativo', async () => {
    const errors = await validate(makeCreate({ stock_base: -1 }));
    expect(errors.some((e) => e.property === 'stock_base')).toBe(true);
  });

  it('rechaza id_categoria que no es entero', async () => {
    const errors = await validate(
      makeCreate({ id_categoria: '2' } as unknown as Partial<CreateProductDto>),
    );
    expect(errors.some((e) => e.property === 'id_categoria')).toBe(true);
  });

  it('rechaza foto_url de host ajeno con mensaje que lista el bucket productos', async () => {
    const errors = await validate(
      makeCreate({ foto_url: 'https://malicioso.com/x.jpg' }),
    );
    expect(errors.some((e) => e.property === 'foto_url')).toBe(true);
    const fotoErrors = errors.filter((e) => e.property === 'foto_url');
    expect(
      Object.values(fotoErrors[0].constraints ?? {}).some((m) =>
        m.includes('productos'),
      ),
    ).toBe(true);
  });

  it('rechaza foto_url de un bucket ajeno', async () => {
    const errors = await validate(
      makeCreate({ foto_url: `${BASE}/public/avatares/30123456.jpg` }),
    );
    expect(errors.some((e) => e.property === 'foto_url')).toBe(true);
  });
});

describe('UpdateProductDto', () => {
  it('acepta un body vacío (todos opcionales)', async () => {
    const errors = await validate(Object.assign(new UpdateProductDto(), {}));
    expect(errors).toHaveLength(0);
  });

  it('acepta foto_url=null para limpiar el campo', async () => {
    const errors = await validate(
      Object.assign(new UpdateProductDto(), { foto_url: null }),
    );
    expect(errors).toHaveLength(0);
  });

  it('acepta valores válidos', async () => {
    const errors = await validate(
      Object.assign(new UpdateProductDto(), {
        nombre: 'XL',
        precio_unitario: 1350,
        stock_base: 5,
        foto_url: PRODUCT_URL,
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rechaza stock_base negativo', async () => {
    const errors = await validate(
      Object.assign(new UpdateProductDto(), { stock_base: -1 }),
    );
    expect(errors.some((e) => e.property === 'stock_base')).toBe(true);
  });

  it('rechaza foto_url de bucket ajeno', async () => {
    const errors = await validate(
      Object.assign(new UpdateProductDto(), {
        foto_url: `${BASE}/public/documentos-verificacion/doc.jpg`,
      }),
    );
    expect(errors.some((e) => e.property === 'foto_url')).toBe(true);
  });
});