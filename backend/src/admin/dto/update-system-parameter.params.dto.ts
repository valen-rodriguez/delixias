import { IsIn } from 'class-validator';

export class UpdateSystemParameterParamsDto {
  @IsIn([
    'radio_cobertura_km',
    'timeout_pedido_min',
    'timeout_jornada_inactividad_horas',
    'anonimizacion_horas_ubicacion',
  ])
  clave: string;
}
