import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class CreateShipmentFromOrderDto {
  @IsString()
  orderId!: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;
}

export class PickItemDto {
  @IsString()
  itemId!: string;

  @IsInt()
  @Min(1)
  pickedQuantity!: number;
}

export class HandoverShipmentDto {
  @IsString()
  shipmentId!: string;

  @IsString()
  carrierName!: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CancelShipmentDto {
  @IsString()
  shipmentId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
