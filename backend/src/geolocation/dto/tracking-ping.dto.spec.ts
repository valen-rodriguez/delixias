import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { TrackingPingDto } from './tracking-ping.dto.js';

describe('TrackingPingDto', () => {
  it('should validate a valid ping', async () => {
    const dto = plainToInstance(TrackingPingDto, {
      lat: -38.0054771,
      lng: -57.5426106,
      timestamp_medicion: '2026-09-11T15:00:07.000Z',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject lat out of Argentina range', async () => {
    const dto = plainToInstance(TrackingPingDto, {
      lat: 10.0,
      lng: -57.5426106,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject lng out of Argentina range', async () => {
    const dto = plainToInstance(TrackingPingDto, {
      lat: -38.0054771,
      lng: 10.0,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept valid Argentina coordinates', async () => {
    const dto = plainToInstance(TrackingPingDto, {
      lat: -34.6037,
      lng: -58.3816,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept Bariloche coordinates', async () => {
    const dto = plainToInstance(TrackingPingDto, {
      lat: -41.1335,
      lng: -71.3103,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept Neuquén coordinates', async () => {
    const dto = plainToInstance(TrackingPingDto, {
      lat: -38.9517,
      lng: -68.0591,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject missing lat', async () => {
    const dto = plainToInstance(TrackingPingDto, {
      lng: -57.5426106,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing lng', async () => {
    const dto = plainToInstance(TrackingPingDto, {
      lat: -38.0054771,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept null timestamp_medicion (optional)', async () => {
    const dto = plainToInstance(TrackingPingDto, {
      lat: -38.0054771,
      lng: -57.5426106,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject invalid ISO-8601 timestamp', async () => {
    const dto = plainToInstance(TrackingPingDto, {
      lat: -38.0054771,
      lng: -57.5426106,
      timestamp_medicion: 'not-a-date',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
