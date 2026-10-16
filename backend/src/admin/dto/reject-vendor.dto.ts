import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectVendorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  motivo: string;
}
