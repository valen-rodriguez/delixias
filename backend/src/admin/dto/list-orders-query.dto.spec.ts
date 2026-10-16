import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ListOrdersQueryDto } from './list-orders-query.dto.js';

describe('ListOrdersQueryDto', () => {
  it('debe aceptar valores vacíos', async () => {
    const dto = plainToInstance(ListOrdersQueryDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('debe rechazar UUID inválido en id_vendedor', async () => {
    const dto = plainToInstance(ListOrdersQueryDto, { id_vendedor: 'no-es-uuid' });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'id_vendedor')).toBe(true);
  });
});
