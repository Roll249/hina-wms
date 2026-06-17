import { Body, Controller, Post } from '@nestjs/common';
import { UploadService } from './upload.service';
import { GetPresignedUrlDto } from './dto/upload.dto';

@Controller('upload')
export class UploadController {
  constructor(private readonly upload: UploadService) {}

  /**
   * Generic presigned URL cho upload file bất kỳ.
   * @param dto { contentType: string, folder: string }
   *   folder: "categories/categories" | "categories/banners" | "products/:id"
   */
  @Post('presigned')
  getPresignedUrl(@Body() dto: GetPresignedUrlDto) {
    return this.upload.generatePresignedUrl(dto.folder, dto.contentType);
  }
}
