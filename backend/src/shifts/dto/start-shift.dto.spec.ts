import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { StartShiftDto } from './start-shift.dto.js';

function makeDto(overrides: Partial<StartShiftDto> = {}): StartShiftDto {
  return Object.assign(new StartShiftDto(), {
    lat: -38.0054771,
    lng: -57.5426106,
    ...overrides,
  });
}

describe('StartShiftDto', () => {
  it('acepta coordenadas dentro del área de cobertura', async () => {
    const errors = await validate(makeDto());
    expect(errors).toHaveLength(0);
  });

  it('rechaza coordenada fuera del bounding box de Argentina (Null Island)', async () => {
    const errors = await validate(makeDto({ lat: 0, lng: 0 }));
    for (const field of ['lat', 'lng']) {
      const fieldErrors = errors.filter((e) => e.property === field);
      expect(fieldErrors.length).toBe(1);
      expect(
        Object.values(fieldErrors[0].constraints ?? {}).includes(
          field === 'lat'
            ? 'La latitud está fuera del área de cobertura.'
            : 'La longitud está fuera del área de cobertura.',
        ),
      ).toBe(true);
    }
  });

  it('rechaza latitud fuera de rango por encima', async () => {
    const errors = await validate(makeDto({ lat: -20 }));
    expect(errors.some((e) => e.property === 'lat')).toBe(true);
  });

  it('rechaza longitud fuera de rango por debajo', async () => {
    const errors = await validate(makeDto({ lng: -80 }));
    expect(errors.some((e) => e.property === 'lng')).toBe(true);
  });

  it('rechaza latitud vacía con mensaje de obligatoriedad', async () => {
    const dto = makeDto() as Partial<StartShiftDto>;
    delete dto.lat;
    const errors = await validate(dto as StartShiftDto);
    expect(
      errors.some((e) =>
        Object.values(e.constraints ?? {}).includes(
          'La latitud es obligatoria.',
        ),
      ),
    ).toBe(true);
  });
});