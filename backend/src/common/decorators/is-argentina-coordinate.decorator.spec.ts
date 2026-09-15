import { validate } from 'class-validator';
import {
  IsLatArgentina,
  IsLngArgentina,
} from './is-argentina-coordinate.decorator.js';

class CoordDto {
  @IsLatArgentina({ message: 'La latitud está fuera del área de cobertura.' })
  lat: number;

  @IsLngArgentina({ message: 'La longitud está fuera del área de cobertura.' })
  lng: number;
}

describe('IsLatArgentina / IsLngArgentina', () => {
  it.each([
    [-38.0054771, -57.5426106],
    [-55, -70],
    [-21, -53],
    [-34.6037, -58.3816],
  ])('acepta coordenadas válidas: (%s, %s)', async (lat, lng) => {
    const dto = new CoordDto();
    dto.lat = lat;
    dto.lng = lng;
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it.each([
    [0, 0],
    [-20, -57],
    [-34, -52],
    [91, -57],
    ['-38', -57],
  ])('rechaza coordenadas fuera de cobertura: (%s, %s)', async (lat, lng) => {
    const dto = new CoordDto();
    dto.lat = lat as never;
    dto.lng = lng as never;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rechaza Null Island (0,0)', async () => {
    const dto = new CoordDto();
    dto.lat = 0;
    dto.lng = 0;
    const errors = await validate(dto);
    expect(errors).toHaveLength(2);
    expect(errors[0].constraints).toMatchObject({
      IsLatArgentina: expect.stringContaining('fuera del área de cobertura'),
    });
  });
});