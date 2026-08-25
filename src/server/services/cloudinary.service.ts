import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dzaciuigf',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
});

const UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || 'newproject';

export class CloudinaryService {
  /**
   * Upload a video file buffer to Cloudinary
   */
  static async uploadVideo(
    fileBuffer: Buffer,
    options: {
      folder?: string;
      publicId?: string;
      resourceType?: 'video' | 'auto';
      eager?: string;
    } = {}
  ): Promise<{
    url: string;
    secureUrl: string;
    publicId: string;
    width: number;
    height: number;
    duration: number;
    format: string;
    bytes: number;
  }> {
    const folder = options.folder || 'courses/videos';

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: options.resourceType || 'video',
          eager: options.eager || 'w_640,h_360,c_fill,q_auto|w_1280,h_720,c_fill,q_auto',
          eager_async: true,
          eager_notification_url: undefined,
          upload_preset: UPLOAD_PRESET,
          ...(options.publicId ? { public_id: options.publicId } : {}),
        },
        (error, result) => {
          if (error) reject(new Error(`Cloudinary upload failed: ${error.message}`));
          else if (!result) reject(new Error('Cloudinary upload returned no result'));
          else
            resolve({
              url: result.url,
              secureUrl: result.secure_url,
              publicId: result.public_id,
              width: result.width || 0,
              height: result.height || 0,
              duration: result.duration || 0,
              format: result.format || '',
              bytes: result.bytes || 0,
            });
        }
      );

      const readable = new Readable();
      readable.push(fileBuffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  /**
   * Upload an image (thumbnail, course image) to Cloudinary
   */
  static async uploadImage(
    fileBuffer: Buffer,
    options: {
      folder?: string;
      publicId?: string;
      transformation?: string;
    } = {}
  ): Promise<{
    url: string;
    secureUrl: string;
    publicId: string;
    width: number;
    height: number;
    format: string;
    bytes: number;
  }> {
    const folder = options.folder || 'courses/images';

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          transformation: options.transformation || 'w_800,h_450,c_fill,q_auto',
          upload_preset: UPLOAD_PRESET,
          ...(options.publicId ? { public_id: options.publicId } : {}),
        },
        (error, result) => {
          if (error) reject(new Error(`Cloudinary image upload failed: ${error.message}`));
          else if (!result) reject(new Error('Cloudinary upload returned no result'));
          else
            resolve({
              url: result.url,
              secureUrl: result.secure_url,
              publicId: result.public_id,
              width: result.width || 0,
              height: result.height || 0,
              format: result.format || '',
              bytes: result.bytes || 0,
            });
        }
      );

      const readable = new Readable();
      readable.push(fileBuffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  /**
   * Upload from a URL (for AI-generated thumbnails)
   */
  static async uploadFromUrl(
    url: string,
    options: {
      folder?: string;
      resourceType?: 'image' | 'video';
    } = {}
  ): Promise<{
    url: string;
    secureUrl: string;
    publicId: string;
  }> {
    const folder = options.folder || 'courses/images';
    const result = await cloudinary.uploader.upload(url, {
      folder,
      resource_type: options.resourceType || 'image',
    });
    return {
      url: result.url,
      secureUrl: result.secure_url,
      publicId: result.public_id,
    };
  }

  /**
   * Delete a file from Cloudinary
   */
  static async deleteFile(publicId: string, resourceType: 'image' | 'video' = 'image'): Promise<boolean> {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });
      return result.result === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * Get optimized video URL with transformations
   */
  static getVideoUrl(publicId: string, options: { width?: number; height?: number; quality?: string } = {}): string {
    const { width = 1280, height = 720, quality = 'auto' } = options;
    return cloudinary.url(publicId, {
      resource_type: 'video',
      width,
      height,
      crop: 'fill',
      quality,
      fetch_format: 'auto',
    });
  }

  /**
   * Get video thumbnail URL
   */
  static getVideoThumbnail(publicId: string, options: { width?: number; height?: number } = {}): string {
    const { width = 640, height = 360 } = options;
    return cloudinary.url(publicId, {
      resource_type: 'video',
      width,
      height,
      crop: 'fill',
      format: 'jpg',
      start_offset: '5s',
    });
  }

  /**
   * Get the Cloudinary upload signature for client-side unsigned uploads
   */
  static getUploadSignature(): {
    cloudName: string;
    uploadPreset: string;
    folder: string;
  } {
    return {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'dzaciuigf',
      uploadPreset: UPLOAD_PRESET,
      folder: 'courses/videos',
    };
  }

  /**
   * Check if Cloudinary is configured
   */
  static isConfigured(): boolean {
    return !!(process.env.CLOUDINARY_CLOUD_NAME || 'dzaciuigf');
  }
}

export default CloudinaryService;
