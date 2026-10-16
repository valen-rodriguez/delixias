import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ListShiftsQueryDto } from './list-shifts-query.dto.js';

describe('ListShiftsQueryDto', () => {
  it('debe aceptar valores vacíos', async () => {
    const dto = plainToInstance(ListShiftsQueryDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('debe rechazar estado inválido', async () => {
    const dto = plainToInstance(ListShiftsQueryDto, { estado: 'invalido' });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'estado')).toBe(true);
  });

  it('debe aceptar ACTIVA y FINALIZADA', async () => {
    for (const estado of ['ACTIVA', 'FINALIZADA']) {
      const dto = plainToInstance(ListShiftsQueryDto, { estado });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    }
  });
});
