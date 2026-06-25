import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsEnum,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';

export enum StocktakeStatus {
  DRAFT = 'DRAFT',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum AdjustmentType {
  RECOUNT = 'RECOUNT',         // Đếm lại
  DAMAGED = 'DAMAGED',         // Hư hỏng
  EXPIRED = 'EXPIRED',         // Hết hạn
  LOST = 'LOST',               // Mất
  FOUND = 'FOUND',             // Thừa
  RETURN = 'RETURN',            // Trả lại
}

export class CreateStocktakeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;
}

export class StocktakeItemDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsNumber()
  expectedQty: number;

  @IsNumber()
  countedQty: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsEnum(AdjustmentType)
  adjustmentType?: AdjustmentType;
}

export class AddStocktakeItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StocktakeItemDto)
  items: StocktakeItemDto[];
}

export class UpdateCountedQtyDto {
  @IsNumber()
  countedQty: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsEnum(AdjustmentType)
  adjustmentType?: AdjustmentType;
}

export class ApplyStocktakeDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class ListStocktakesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number;

  @IsOptional()
  @IsEnum(StocktakeStatus)
  status?: StocktakeStatus;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
