import { describe, it, expect } from 'vitest';
import { normalizeDni, isValidDni } from '@/utils/dni';

describe('normalizeDni', () => {
  it('elimina caracteres no numéricos', () => {
    expect(normalizeDni('12.345.678')).toBe('12345678');
  });

  it('limita a 9 dígitos', () => {
    expect(normalizeDni('1234567890')).toBe('123456789');
  });

  it('mantiene cadenas válidas sin cambios', () => {
    expect(normalizeDni('12345678')).toBe('12345678');
  });
});

describe('isValidDni', () => {
  it.each(['1234567', '12345678', '123456789'])('acepta %s (7 a 9 dígitos)', (dni) => {
    expect(isValidDni(dni)).toBe(true);
  });

  it.each(['', '123456', '1234567890', '1234-678', 'abcdefgh'])('rechaza %s', (dni) => {
    expect(isValidDni(dni)).toBe(false);
  });
});
