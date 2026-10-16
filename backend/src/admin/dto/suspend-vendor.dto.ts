import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SuspendVendorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  motivo: string;
}
