import { describe, expect, it } from 'vitest';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateOrderDto } from './create-order.dto.js';

const UUID_V = '11111111-1111-4111-8111-111111111111';
const UUID_P = '22222222-2222-4222-8222-222222222222';

function makeDto(overrides: Record<string, unknown> = {}): CreateOrderDto {
  return plainToInstance(CreateOrderDto, {
    id_vendedor: UUID_V,
    id_medio_pago: 1,
    ubicacion_entrega: { lat: -38.0054771, lng: -57.5426106 },
    lineas: [{ id_producto: UUID_P, cantidad: 2 }],
    ...overrides,
  });
}

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

async function transform(payload: Record<string, unknown>) {
  return pipe.transform(payload, {
    type: 'body',
    metatype: CreateOrderDto,
  });
}

describe('CreateOrderDto', () => {
  it('acepta un pedido válido de una línea', async () => {
    const errors = await validate(makeDto());
    expect(errors).toHaveLength(0);
  });

  it('rechaza id_vendedor que no es UUID', async () => {
    const errors = await validate(makeDto({ id_vendedor: 'nope' }));
    expect(errors.some((e) => e.property === 'id_vendedor')).toBe(true);
  });

  it('rechaza cantidad cero o negativa', async () => {
    const errors = await validate(
      makeDto({ lineas: [{ id_producto: UUID_P, cantidad: 0 }] }),
    );
    expect(
      errors.some((e) => e.property === 'lineas'),
    ).toBe(true);
  });

  it('rechaza carrito vacío', async () => {
    const errors = await validate(makeDto({ lineas: [] }));
    expect(errors.some((e) => e.property === 'lineas')).toBe(true);
  });

  it('rechaza coordenadas fuera del área de cobertura', async () => {
    const errors = await validate(
      makeDto({ ubicacion_entrega: { lat: 0, lng: 0 } }),
    );
    expect(errors.some((e) => e.property === 'ubicacion_entrega')).toBe(true);
  });

  it('rechaza id_jornada con 400 VALIDATION_ERROR vía ValidationPipe', async () => {
    await expect(
      transform({ ...makeDto(), id_jornada: '33333333-3333-4333-8333-333333333333' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza idempotency_key con 400 VALIDATION_ERROR vía ValidationPipe', async () => {
    await expect(
      transform({ ...makeDto(), idempotency_key: 'abc' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('permite el payload válido a través del ValidationPipe', async () => {
    const result = await transform(makeDto() as unknown as Record<string, unknown>);
    expect(result).toBeInstanceOf(CreateOrderDto);
    expect(result).toEqual(
      plainToInstance(CreateOrderDto, makeDto(), {
        enableImplicitConversion: false,
      }),
    );
  });
});
