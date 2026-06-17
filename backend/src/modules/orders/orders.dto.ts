import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
  /** ID sản phẩm (Product hoặc ProductVariant) */
  @IsString()
  productId!: string;

  /** ID biến thể (optional) */
  @IsOptional()
  @IsString()
  variantId?: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto {
  /** Tên khách hàng */
  @IsString()
  customerName!: string;

  /** SĐT khách hàng */
  @IsString()
  customerPhone!: string;

  /** Địa chỉ giao hàng (text) */
  @IsString()
  shippingAddress!: string;

  /** Ghi chú */
  @IsOptional()
  @IsString()
  customerNote?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
