import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { VendorDetailQueryDto } from './vendor-detail-query.dto.js';

describe('VendorDetailQueryDto', () => {
  it('should validate valid coordinates', async () => {
    const dto = plainToInstance(VendorDetailQueryDto, {
      lat: -38.002,
      lng: -57.55,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject lat out of range', async () => {
    const dto = plainToInstance(VendorDetailQueryDto, {
      lat: 50.0,
      lng: -57.55,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject lng out of range', async () => {
    const dto = plainToInstance(VendorDetailQueryDto, {
      lat: -38.002,
      lng: 10.0,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing lat', async () => {
    const dto = plainToInstance(VendorDetailQueryDto, {
      lng: -57.55,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing lng', async () => {
    const dto = plainToInstance(VendorDetailQueryDto, {
      lat: -38.002,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
