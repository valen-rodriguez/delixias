import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { SuspendVendorDto } from './suspend-vendor.dto.js';

describe('SuspendVendorDto', () => {
  it('should require motivo', async () => {
    const dto = new SuspendVendorDto();
    dto.motivo = '';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

