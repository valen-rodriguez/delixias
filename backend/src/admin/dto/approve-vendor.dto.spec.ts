import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ApproveVendorDto } from './approve-vendor.dto.js';

describe('ApproveVendorDto', () => {
  it('debe aceptar objeto vacío (motivo opcional)', async () => {
    const dto = plainToInstance(ApproveVendorDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('debe aceptar motivo válido', async () => {
    const dto = plainToInstance(ApproveVendorDto, { motivo: 'documentos correctos' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
