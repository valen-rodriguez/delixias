import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export interface ArgentinaBounds {
  min: number;
  max: number;
}

const ARGENTINA_LAT: ArgentinaBounds = { min: -55, max: -21 };
const ARGENTINA_LNG: ArgentinaBounds = { min: -74, max: -53 };

function makeRangeValidator(
  name: string,
  bounds: ArgentinaBounds,
  rangeLabel: string,
): (opts?: ValidationOptions) => PropertyDecorator {
  return function (opts: ValidationOptions = {}): PropertyDecorator {
    return function (object: object, propertyName: string | symbol) {
      registerDecorator({
        name,
        target: object.constructor,
        propertyName: propertyName as string,
        options: opts,
        validator: {
          validate(value: unknown): boolean {
            return (
              typeof value === 'number' &&
              Number.isFinite(value) &&
              value >= bounds.min &&
              value <= bounds.max
            );
          },
          defaultMessage({ property }: ValidationArguments): string {
            return `${property} debe ser un número dentro del rango ${rangeLabel} (${bounds.min} a ${bounds.max}).`;
          },
        },
      });
    };
  };
}

export const IsLatArgentina = makeRangeValidator(
  'IsLatArgentina',
  ARGENTINA_LAT,
  'latitud de cobertura',
);

export const IsLngArgentina = makeRangeValidator(
  'IsLngArgentina',
  ARGENTINA_LNG,
  'longitud de cobertura',
);