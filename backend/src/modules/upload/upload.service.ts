import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

@Injectable()
export class UploadService {
  private readonly internalClient: S3Client;
  private readonly publicClient: S3Client;
  private readonly bucket: string;
  private readonly publicEndpoint: string;
  private readonly publicUrl: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('MINIO_BUCKET');
    this.publicEndpoint = config.getOrThrow<string>('MINIO_PUBLIC_ENDPOINT');
    this.publicUrl = config.getOrThrow<string>('MINIO_PUBLIC_URL');
    const internalEndpoint = config.getOrThrow<string>('MINIO_INTERNAL_ENDPOINT');
    const region = config.get<string>('MINIO_REGION') ?? 'us-east-1';
    const accessKeyId = config.getOrThrow<string>('MINIO_ROOT_USER');
    const secretAccessKey = config.getOrThrow<string>('MINIO_ROOT_PASSWORD');

    const baseConfig = {
      region,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    } as const;

    this.internalClient = new S3Client({ ...baseConfig, endpoint: internalEndpoint });
    // Public client ký với `https://ecom.neulon.io.vn` (no port, no /storage)
    // → signature match với Host header mà nginx sẽ gửi cho MinIO.
    this.publicClient = new S3Client({ ...baseConfig, endpoint: this.getSigningEndpoint(this.publicEndpoint) });
  }

  /**
   * Strip path/port khỏi endpoint URL để tạo signing endpoint.
   * - Input:  https://ecom.neulon.io.vn/storage  → https://ecom.neulon.io.vn
   * - Input:  http://minio:9000                   → http://minio:9000
   */
  private getSigningEndpoint(endpoint: string): string {
    try {
      const u = new URL(endpoint);
      return `${u.protocol}//${u.host}`;
    } catch {
      return endpoint;
    }
  }

    /**
     * Generic presigned URL cho upload bất kỳ file nào vào MinIO.
     * @param folder Dạng "categories/categories" hoặc "categories/banners" hoặc "products/:id"
     */
    async generatePresignedUrl(folder: string, contentType: string) {
      const ext = CONTENT_TYPE_EXTENSIONS[contentType] ?? 'jpg';
      const key = `${folder.replace(/^\/+|\/+$/g, '')}/${crypto.randomUUID()}.${ext}`;

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      });

    const signedUrl = await getSignedUrl(this.publicClient, command, { expiresIn: 3600 });
    const uploadUrl = this.rewritePresignedUploadUrl(signedUrl);
      const finalUrl = `${this.publicUrl}/${key}`;

      return { uploadUrl, publicUrl: finalUrl, key };
    }

    /**
     * Rewrite presigned URL để browser có thể PUT qua nginx proxy.
     *
     * MinIO presigned URL ký dựa trên host trong URL (bao gồm cả port).
     * Nếu ký với "minio:9000" thì URL = "http://minio:9000/lotussouvenir/products/...
     *  ?X-Amz-...&X-Amz-SignedHeaders=host&X-Amz-Signature=..."
     *
     * Nginx proxy /storage/* → minio:9000 với proxy_set_header Host $host
     * (= ecom.neulon.io.vn) → MinIO tính signature lại với host mới → mismatch.
     *
     * Cần ký với host KHỚP với Host header mà MinIO sẽ nhận, tức là
     * "ecom.neulon.io.vn" (không port). Nhưng vẫn cần PUT qua /storage/...
     * vì nginx chỉ proxy path đó.
     *
     * Workaround: ký với host = public domain (no port), path = /lotussouvenir/...
     * Sau đó insert "/storage" vào trước path khi return về client.
     */
    private rewritePresignedUploadUrl(signedUrl: string): string {
      try {
        const url = new URL(signedUrl);
        // Insert "/storage" prefix vào path
        if (!url.pathname.startsWith('/storage/')) {
          url.pathname = `/storage${url.pathname.startsWith('/') ? '' : '/'}${url.pathname}`;
        }
        return url.toString();
      } catch {
        return signedUrl;
      }
    }

  /**
   * Xóa 1 file trên MinIO theo public URL hoặc key.
   * Accept cả URL đầy đủ (https://...) lẫn key (products/abc/xyz.jpg).
   */
  async deleteFile(urlOrKey: string): Promise<{ ok: boolean; key: string | null }> {
    const key = this.getObjectKey(urlOrKey);
    if (!key) return { ok: false, key: null };

    try {
      await this.internalClient.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { ok: true, key };
    } catch {
      // Log lỗi nhưng vẫn return ok - có thể file đã bị xóa trước đó
      return { ok: false, key };
    }
  }

  /**
   * Extract key từ URL hoặc trả về key nếu input đã là key.
   */
  private getObjectKey(urlOrKey: string): string | null {
    if (!urlOrKey) return null;
    // Nếu là URL đầy đủ
    if (urlOrKey.startsWith('http://') || urlOrKey.startsWith('https://')) {
      try {
        const u = new URL(urlOrKey);
        // pathname dạng /storage/lotussouvenir/products/abc/xyz.jpg
        // → cần strip /<bucket-name>/
        const path = u.pathname.replace(/^\/+/, '');
        const bucketPrefix = `${this.bucket}/`;
        if (path.startsWith(bucketPrefix)) {
          return path.slice(bucketPrefix.length);
        }
        return path;
      } catch {
        return null;
      }
    }
    return urlOrKey;
  }
}
