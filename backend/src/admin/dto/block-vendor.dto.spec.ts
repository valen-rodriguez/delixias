import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BlockVendorDto } from './block-vendor.dto.js';

describe('BlockVendorDto', () => {
  it('debe rechazar motivo vacío', async () => {
    const dto = plainToInstance(BlockVendorDto, { motivo: '' });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'motivo')).toBe(true);
  });

  it('debe aceptar motivo válido', async () => {
    const dto = plainToInstance(BlockVendorDto, { motivo: 'fraude' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
