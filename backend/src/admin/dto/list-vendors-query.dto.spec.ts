import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ListVendorsQueryDto } from './list-vendors-query.dto.js';

describe('ListVendorsQueryDto', () => {
  it('debe aceptar valores por defecto', async () => {
    const dto = plainToInstance(ListVendorsQueryDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('debe rechazar page menor a 1', async () => {
    const dto = plainToInstance(ListVendorsQueryDto, { page: 0 });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'page')).toBe(true);
  });

  it('debe aceptar estado_vendedor válido', async () => {
    const dto = plainToInstance(ListVendorsQueryDto, { estado_vendedor: 'activo' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('debe rechazar estado_vendedor inválido', async () => {
    const dto = plainToInstance(ListVendorsQueryDto, { estado_vendedor: 'invalido' });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'estado_vendedor')).toBe(true);
  });
});
