import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveVendorDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
