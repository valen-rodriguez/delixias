import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { VendorDetailParamsDto } from './vendor-detail.params.dto.js';

describe('VendorDetailParamsDto', () => {
  it('debe rechazar id no UUID', async () => {
    const dto = plainToInstance(VendorDetailParamsDto, { id: 'no-uuid' });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'id')).toBe(true);
  });

  it('debe aceptar UUID válido', async () => {
    const dto = plainToInstance(VendorDetailParamsDto, { id: '550e8400-e29b-41d4-a716-446655440000' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
