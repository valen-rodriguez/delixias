import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateSystemParameterDto } from './update-system-parameter.dto.js';

describe('UpdateSystemParameterDto', () => {
  it('debe rechazar valor vacío', async () => {
    const dto = plainToInstance(UpdateSystemParameterDto, { valor: '' });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'valor')).toBe(true);
  });

  it('debe aceptar valor válido', async () => {
    const dto = plainToInstance(UpdateSystemParameterDto, { valor: '5' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
