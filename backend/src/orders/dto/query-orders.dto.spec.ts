import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryOrdersDto } from './query-orders.dto.js';

function makeDto(overrides: Record<string, unknown> = {}): QueryOrdersDto {
  return plainToInstance(QueryOrdersDto, overrides);
}

describe('QueryOrdersDto', () => {
  it('acepta un DTO vacío', async () => {
    expect(await validate(makeDto())).toHaveLength(0);
  });

  it('acepta un estado válido con paginación', async () => {
    const errors = await validate(
      makeDto({ status: 'solicitado', page: 2, limit: 50 }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rechaza un estado desconocido', async () => {
    const errors = await validate(makeDto({ status: 'expirado' }));
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rechaza limit fuera de rango', async () => {
    const errors = await validate(makeDto({ limit: 999 }));
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});
