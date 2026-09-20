import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RadarQueryDto } from './radar-query.dto.js';

describe('RadarQueryDto', () => {
  it('should validate a valid query', async () => {
    const dto = plainToInstance(RadarQueryDto, {
      lat: -38.002,
      lng: -57.55,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate with optional categoria', async () => {
    const dto = plainToInstance(RadarQueryDto, {
      lat: -38.002,
      lng: -57.55,
      categoria: 1,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject lat out of range', async () => {
    const dto = plainToInstance(RadarQueryDto, {
      lat: 50.0,
      lng: -57.55,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject lng out of range', async () => {
    const dto = plainToInstance(RadarQueryDto, {
      lat: -38.002,
      lng: 10.0,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
