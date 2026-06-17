import { IsInt, Min, IsOptional, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SetWebStockDto {
  /** ID sản phẩm (Product hoặc ProductVariant) */
  @IsString()
  targetId!: string;

  /** Số lượng tối đa cho phép bán trên web */
  @IsInt()
  @Min(0)
  webListedQty!: number;
}

export class SyncItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  /** +1 khi có đơn mới, -1 khi hủy */
  @IsInt()
  deltaSold!: number;
}

export class BulkSyncFromWebDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncItemDto)
  items!: SyncItemDto[];
}
