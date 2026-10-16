import { IsUUID } from 'class-validator';

export class VendorDetailParamsDto {
  @IsUUID()
  id: string;
}
