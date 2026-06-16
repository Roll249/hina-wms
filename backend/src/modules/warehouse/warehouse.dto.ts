import { IsString, IsOptional, IsBoolean, IsEmail, IsInt, Min } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateSupplierDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class CreateWarehouseStaffDto {
  @IsString()
  userId!: string;

  @IsString()
  employeeCode!: string;

  @IsString()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  pin?: string; // 4-6 số, optional - có thể set sau
}

export class UpdateStaffPinDto {
  @IsString()
  @IsInt()
  @Min(100000)
  pin!: string; // PIN 4-6 số
}
