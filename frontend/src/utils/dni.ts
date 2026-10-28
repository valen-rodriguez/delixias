export const normalizeDni = (input: string): string => {
  return input.replace(/\D/g, '').slice(0, 9);
};

export const isValidDni = (dni: string): boolean => {
  return /^[0-9]{7,9}$/.test(dni);
};
