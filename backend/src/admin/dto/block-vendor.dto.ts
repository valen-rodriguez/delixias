import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class BlockVendorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  motivo: string;
}
