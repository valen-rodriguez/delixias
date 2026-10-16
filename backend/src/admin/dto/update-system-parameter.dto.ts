import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateSystemParameterDto {
  @IsString()
  @IsNotEmpty()
  valor: string;
}
