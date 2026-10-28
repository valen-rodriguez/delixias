import { describe, it, expect } from 'vitest';
import { normalizePhone, isValidE164, E164_REGEX, formatPhoneMask } from '@/utils/phone';

describe('normalizePhone', () => {
  it('removes spaces, hyphens, parentheses', () => {
    expect(normalizePhone('011 15 1234-5678')).toBe('+5491112345678');
  });

  it('removes leading 0 trunk prefix', () => {
    expect(normalizePhone('0221 15 9876543')).toBe('+5492219876543');
  });

  it('removes leading 15 mobile prefix', () => {
    expect(normalizePhone('1512345678')).toBe('+54912345678');
  });

  it('adds country code 54 when missing', () => {
    expect(normalizePhone('91112345678')).toBe('+5491112345678');
  });

  it('ensures mobile prefix 9 after 54', () => {
    expect(normalizePhone('541112345678')).toBe('+5491112345678');
  });

  it('keeps already valid E.164 intact', () => {
    expect(normalizePhone('+5491112345678')).toBe('+5491112345678');
  });

  it('empty string returns empty', () => {
    expect(normalizePhone('')).toBe('');
  });
});

describe('isValidE164', () => {
  it('accepts valid Argentine mobile E.164', () => {
    expect(isValidE164('+5491112345678')).toBe(true);
    expect(isValidE164('+5492219876543')).toBe(true);
  });

  it('rejects invalid formats', () => {
    expect(isValidE164('+541112345678')).toBe(false);
    expect(isValidE164('+549111234567')).toBe(false);
    expect(isValidE164('1112345678')).toBe(false);
    expect(isValidE164('')).toBe(false);
  });
});

describe('E164_REGEX', () => {
  it('matches exactly +549 followed by 10 digits', () => {
    expect(E164_REGEX.test('+5491112345678')).toBe(true);
    expect(E164_REGEX.test('+5490000000000')).toBe(true);
  });
});

describe('formatPhoneMask', () => {
  it('strips all non-digit characters', () => {
    expect(formatPhoneMask('+54 9 11 1234-5678')).toBe('5491112345678');
  });

  it('returns empty for non-digit input', () => {
    expect(formatPhoneMask('abc')).toBe('');
    expect(formatPhoneMask('')).toBe('');
  });
});
