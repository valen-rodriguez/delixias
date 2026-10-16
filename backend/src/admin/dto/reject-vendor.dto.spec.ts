import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RejectVendorDto } from './reject-vendor.dto.js';

describe('RejectVendorDto', () => {
  it('debe rechazar motivo vacío', async () => {
    const dto = plainToInstance(RejectVendorDto, { motivo: '' });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'motivo')).toBe(true);
  });

  it('debe aceptar motivo válido', async () => {
    const dto = plainToInstance(RejectVendorDto, { motivo: 'documentos invalidos' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
