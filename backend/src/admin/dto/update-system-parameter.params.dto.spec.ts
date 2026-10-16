import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateSystemParameterParamsDto } from './update-system-parameter.params.dto.js';

describe('UpdateSystemParameterParamsDto', () => {
  const validKeys = [
    'radio_cobertura_km',
    'timeout_pedido_min',
    'timeout_jornada_inactividad_horas',
    'anonimizacion_horas_ubicacion',
  ];

  it('debe aceptar claves válidas', async () => {
    for (const clave of validKeys) {
      const dto = plainToInstance(UpdateSystemParameterParamsDto, { clave });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    }
  });

  it('debe rechazar clave inválida', async () => {
    const dto = plainToInstance(UpdateSystemParameterParamsDto, { clave: 'clave_inexistente' });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'clave')).toBe(true);
  });
});
