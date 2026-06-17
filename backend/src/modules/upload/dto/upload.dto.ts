import { IsString, IsIn, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';

// Product image presigned (uses folder=products/:id automatically)
export class GetProductImagePresignedDto {
  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  contentType: string;
}

// Generic presigned (caller specifies folder path)
export class GetPresignedUrlDto {
  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  contentType: string;

  @IsString()
  folder: string;
}

export class AddProductImageDto {
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateProductImageDto {
  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
