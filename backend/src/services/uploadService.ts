import multer from 'multer';
import { cloudinary } from '../utils/cloudinaryAdapter';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { logger } from '../utils/logger';
import { TenantConfigService } from './tenantConfigService';
import { getTenantId } from '../middleware/tenantMiddleware';
import type {
  CloudinaryConfig,
  ImageType,
} from '../types/tenantConfig';
import type { Request, Response, NextFunction } from 'express';
import { externalCall } from '../utils/externalAdapter';
import ConfigService from './configService';
import { Counter } from 'prom-client';
import { promRegister } from '../utils/opMetrics';

// Telemetry counters
const ruleAppliedCounter = new Counter({
  name: 'image_rule_applied_total',
  help: 'Image upload rules applied',
  labelNames: ['imageType'],
  registers: [promRegister],
});

const minSourceRejectCounter = new Counter({
  name: 'image_min_source_reject_total',
  help: 'Images rejected due to min source requirements',
  labelNames: ['imageType'],
  registers: [promRegister],
});

const uploadsResizedCounter = new Counter({
  name: 'uploads_resized_total',
  help: 'Images processed with eager resize transformations',
  labelNames: ['imageType'],
  registers: [promRegister],
});

// Verify Cloudinary configuration for a tenant and apply it
export async function requireCloudinaryConfigured(tenantId?: string) {
  let id = tenantId || getTenantId();
  if (!id) {
    const { TenantService } = await import('./tenantService');
    const defaultTenant = await TenantService.getOrCreateDefaultTenant();
    id = defaultTenant.id;
  }
  const cfg = await TenantConfigService.getConfig<CloudinaryConfig>(id, 'cloudinary');
  if (cfg?.cloudName && cfg?.apiKey && cfg?.apiSecret) {
    cloudinary.config({
      cloud_name: cfg.cloudName,
      api_key: cfg.apiKey,
      api_secret: cfg.apiSecret,
    });
    return cfg;
  }
  const err: any = new Error('Cloudinary configuration missing');
  err.code = 'CLOUDINARY_CONFIG_MISSING';
  throw err;
}

// baseline config at module load – start blank
cloudinary.config({});

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

export function uploadWithRules(
  imageType: ImageType,
  field: string = 'images',
  maxCount = 10
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      let tenantId = (req as any).tenantId || getTenantId();
      if (!tenantId) {
        const { TenantService } = await import('./tenantService');
        const defaultTenant = await TenantService.getOrCreateDefaultTenant();
        tenantId = defaultTenant.id;
      }
      const rule = await ConfigService.getTenantImageRule(tenantId, imageType);
      const upload = multer({
        storage: multer.memoryStorage(),
        limits: rule.maxUploadBytes ? { fileSize: rule.maxUploadBytes } : undefined,
        fileFilter: (_req, file, cb) => {
          const allowed = rule.allowedTypes || ALLOWED_MIME;
          if (!allowed.includes(file.mimetype)) {
            const error: any = new Error('Unsupported image type');
            error.status = 400;
            return cb(error);
          }
          cb(null, true);
        },
      }).array(field, maxCount);
      upload(req, res, err => {
        if (err) {
          if ((err as any).code === 'LIMIT_FILE_SIZE') {
            (err as any).status = 400;
          }
          return next(err);
        }
        next();
      });
    } catch (err) {
      next(err);
    }
  };
}

export class UploadService {
  static async uploadSingleImage(
    file: Express.Multer.File,
    folder: string = 'general',
    imageType: ImageType = 'destinations'
  ) {
    try {
      await requireCloudinaryConfigured();
      let tenantId = getTenantId();
      if (!tenantId) {
        const { TenantService } = await import('./tenantService');
        const defaultTenant = await TenantService.getOrCreateDefaultTenant();
        tenantId = defaultTenant.id;
      }
      const rule = await ConfigService.getTenantImageRule(tenantId, imageType);

      logger.info('Applying image rule', {
        tenantId,
        imageType,
        rule,
        ruleVersion: ConfigService.generateEtag(rule),
      });
      ruleAppliedCounter.inc({ imageType });

      if (rule.maxUploadBytes && file.size > rule.maxUploadBytes) {
        const err: any = new Error('File too large');
        err.status = 400;
        throw err;
      }

      const buffer = file.buffer;
      const detected = await fileTypeFromBuffer(buffer);
      const allowed = rule.allowedTypes || ALLOWED_MIME;
      if (!detected || !allowed.includes(detected.mime)) {
        const err: any = new Error('Invalid or unsupported image type');
        err.status = 400;
        throw err;
      }

      if (rule.minSource) {
        const meta = await sharp(buffer).metadata();
        const w = meta.width || 0;
        const h = meta.height || 0;
        if (w < rule.minSource.width || h < rule.minSource.height) {
          minSourceRejectCounter.inc({ imageType });
          const err: any = new Error('Image dimensions too small');
          err.status = 400;
          throw err;
        }
      }

      const eager = [
        {
          width: rule.width,
          height: rule.height,
          crop: rule.fit === 'contain' ? 'pad' : 'fill',
          quality: rule.quality ?? 'auto',
          format: rule.format ?? 'webp',
        },
        ...(rule.thumbnails || []).map(t => ({
          width: t,
          crop: 'scale',
          quality: 'auto',
          format: rule.format ?? 'webp',
        })),
      ];

      if (eager.length) {
        uploadsResizedCounter.inc({ imageType });
      }

      const result: any = await new Promise((resolve, reject) => {
        const allowedFormats = (rule.allowedTypes || ALLOWED_MIME).map(m => {
          switch (m) {
            case 'image/jpeg':
              return 'jpg';
            case 'image/png':
              return 'png';
            case 'image/webp':
              return 'webp';
            default:
              return m.split('/')[1];
          }
        });

        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `website/${folder}`,
            allowed_formats: allowedFormats,
            format: rule.format ?? 'webp',
            eager,
            eager_async: true,
          },
          (error, res) => {
            if (error) reject(error);
            else resolve(res);
          }
        );
        stream.end(buffer);
      });

      logger.info('Image uploaded successfully:', { publicId: result.public_id, url: result.secure_url });
      return {
        publicId: result.public_id,
        url: result.secure_url,
        width: result.width,
        height: result.height,
      };
    } catch (error: any) {
      logger.error('Error uploading image:', error);
      if (error?.status) throw error;
      const err: any = new Error('Failed to upload image');
      err.status = 500;
      throw err;
    }
  }

  static async uploadMultipleImages(
    files: Express.Multer.File[],
    folder: string = 'general',
    imageType: ImageType = 'destinations'
  ) {
    try {
      await requireCloudinaryConfigured();
      const uploadPromises = files.map(file =>
        this.uploadSingleImage(file, folder, imageType)
      );
      const results = await Promise.all(uploadPromises);

      logger.info('Multiple images uploaded successfully:', { count: results.length });
      return results;
    } catch (error: any) {
      logger.error('Error uploading multiple images:', error);
      if (error?.status) throw error;
      const err: any = new Error('Failed to upload images');
      err.status = 500;
      throw err;
    }
  }

  static async deleteImage(publicId: string) {
    try {
      await requireCloudinaryConfigured();
      const result = await cloudinary.uploader.destroy(publicId);
      logger.info('Image deleted successfully:', { publicId, result });
      return result;
    } catch (error) {
      logger.error('Error deleting image:', error);
      throw new Error('Failed to delete image');
    }
  }

  // Get images from Cloudinary
  static async getImages(
    folder: string = '',
    options: { limit?: number; nextCursor?: string; prefix?: string } = {}
  ): Promise<any> {
    try {
      await requireCloudinaryConfigured();
      const { limit = 25, nextCursor, prefix } = options;
      
      const params: any = { type: 'upload', max_results: limit };
      
      if (folder) {
        params.prefix = `website/${folder}`;
      } else if (prefix) {
        params.prefix = prefix;
      } else {
        params.prefix = 'website';
      }
      if (nextCursor) {
        params.next_cursor = nextCursor;
      }
      
      const result = await externalCall('cloudinary', _s => cloudinary.api.resources(params));
      
      return {
        images: result.resources.map((resource: any) => ({
          id: resource.public_id,
          url: resource.secure_url,
          width: resource.width,
          height: resource.height,
          format: resource.format,
          created: resource.created_at,
          bytes: resource.bytes,
          folder: resource.folder,
        })),
        hasMore: result.next_cursor ? true : false,
        nextCursor: result.next_cursor,
      };
    } catch (error) {
      logger.error('Error fetching images from Cloudinary:', error);
      throw new Error('Failed to fetch images');
    }
  }

  // Search images from Cloudinary
  static async searchImages(
    query: string,
    options: { limit?: number; nextCursor?: string } = {}
  ): Promise<any> {
    try {
      await requireCloudinaryConfigured();
      const { limit = 25, nextCursor } = options;
      const params: any = {
        expression: `folder:website* AND ${query}`,
        max_results: limit,
      };
      if (nextCursor) {
        params.next_cursor = nextCursor;
      }
      const result = await externalCall('cloudinary', _s =>
        cloudinary.search.expression(params.expression).max_results(params.max_results).execute()
      );
      return {
        images: result.resources.map((resource: any) => ({
          id: resource.public_id,
          url: resource.secure_url,
          width: resource.width,
          height: resource.height,
          format: resource.format,
          created: resource.created_at,
          bytes: resource.bytes,
          folder: resource.folder,
        })),
        hasMore: result.next_cursor ? true : false,
        nextCursor: result.next_cursor,
      };
    } catch (error) {
      logger.error('Error searching images from Cloudinary:', error);
      throw new Error('Failed to search images');
    }
  }
  static async optimizeImage(
    buffer: Buffer,
    options: { width?: number; height?: number; quality?: number; format?: 'jpeg' | 'png' | 'webp' } = {}
  ) {
    try {
      await requireCloudinaryConfigured();
      let sharpInstance = sharp(buffer);
      if (options.width || options.height) {
        sharpInstance = sharpInstance.resize(options.width, options.height, {
          fit: 'cover',
          position: 'center',
        });
      }
      if (options.format) {
        sharpInstance = sharpInstance.toFormat(options.format, {
          quality: options.quality || 85,
        });
      }
      const optimizedBuffer = await sharpInstance.toBuffer();
      logger.info('Image optimized successfully');
      return optimizedBuffer;
    } catch (error) {
      logger.error('Error optimizing image:', error);
      throw new Error('Failed to optimize image');
    }
  }
}