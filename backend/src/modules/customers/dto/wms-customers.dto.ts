import { IsString, IsOptional, ValidateNested, IsArray, ArrayMinSize, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ManualCustomerAddressDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsString()
  name!: string;

  @IsString()
  phone!: string;

  @IsString()
  street!: string;

  @IsOptional()
  @IsString()
  ward?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsString()
  city!: string;

  @IsString()
  province!: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;
}

export class CreateManualOrderCustomerDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  businessId?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  dic?: string;

  @ValidateNested()
  @Type(() => ManualCustomerAddressDto)
  deliveryAddress!: ManualCustomerAddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ManualCustomerAddressDto)
  companyAddress?: ManualCustomerAddressDto;
}

export class ListCustomersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}

export class CreateOrderItemDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto {
  @IsString()
  customerName!: string;

  @IsString()
  customerPhone!: string;

  @IsString()
  shippingAddress!: string;

  @IsOptional()
  @IsString()
  customerNote?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
