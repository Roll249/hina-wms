import { IsString, IsOptional, IsInt, Min, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ReceiptSource } from '@prisma/client';

export class CreateReceiptDto {
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  source?: ReceiptSource; // MANUAL | BARCODE | FILE
}

export class AddReceiptItemDto {
  @IsString()
  receiptId!: string;

  /** Mã sản phẩm (UPC/SKU/productCode) - dùng để tra cứu */
  @IsString()
  productCode!: string;

  @IsInt()
  @Min(1)
  receivedQuantity!: number;

  @IsOptional()
  @IsNumber()
  unitCost?: number;

  @IsOptional()
  @IsString()
  lotNumber?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class BulkReceiptItemDto {
  @IsString()
  productCode!: string;

  @IsInt()
  @Min(1)
  receivedQuantity!: number;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsNumber()
  unitCost?: number;
}

export class ImportReceiptsDto {
  @IsString()
  receiptNumber!: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkReceiptItemDto)
  items!: BulkReceiptItemDto[];
}

export class ScanBarcodeResultDto {
  exists!: boolean;
  product?: {
    id: string;
    productCode: string;
    sku: string;
    name: string;
    variantId: string | null;
    variantName?: string;
    quantity: number;
    imageUrl?: string;
  };
  action!: 'add-quantity' | 'create-new';
  suggestedCode?: string;
}

export class ConfirmReceiptDto {
  @IsString()
  receiptId!: string;
}
