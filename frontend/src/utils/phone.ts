const FORMAT_CHARS = /[\s\-()]+/g;
export const E164_REGEX = /^\+549\d{10}$/;

export const normalizePhone = (raw: string): string => {
  if (!raw.trim()) return '';

  let digits = raw.replace(FORMAT_CHARS, '');

  if (digits.startsWith('+')) {
    digits = digits.slice(1);
  }

  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  const idx15 = digits.indexOf('15');
  if (idx15 >= 0) {
    digits = digits.slice(0, idx15) + digits.slice(idx15 + 2);
  }

  if (!digits.startsWith('54')) {
    digits = '54' + digits;
  }

  if (digits.startsWith('54') && !digits.startsWith('549')) {
    digits = '549' + digits.slice(2);
  }

  return '+' + digits;
};

export const isValidE164 = (value: string): boolean => E164_REGEX.test(value);

export const formatPhoneMask = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return digits;
};
