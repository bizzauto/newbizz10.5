import { prisma } from '../db.js';
import axios from 'axios';
import { decrypt } from '../utils/auth.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'facebook');
const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';

// ── Helpers ──

async function getFacebookCredentials(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { fbPageId: true, fbAccessToken: true },
  });

  if (!business?.fbPageId || !business?.fbAccessToken) {
    throw new Error('Facebook not configured. Connect your Facebook Page first.');
  }

  return {
    fbPageId: business.fbPageId,
    accessToken: decrypt(business.fbAccessToken),
  };
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class FacebookService {
  /**
   * Get Facebook Page info (name, followers, etc.)
   */
  static async getAccountInfo(businessId: string) {
    const { fbPageId, accessToken } = await getFacebookCredentials(businessId);

    const { data } = await axios.get(`${GRAPH_API_BASE}/${fbPageId}`, {
      params: {
        fields: 'id,name,about,fan_count,followers_count,posts_count,link,picture',
        access_token: accessToken,
      },
    });

    return data;
  }

  /**
   * Upload a media file to the server's local storage
   * Returns the public URL for the uploaded file
   */
  static async uploadMediaFile(businessId: string, file: Express.Multer.File): Promise<string> {
    // Ensure upload directory exists
    const businessDir = path.join(UPLOADS_DIR, businessId);
    if (!fs.existsSync(businessDir)) {
      fs.mkdirSync(businessDir, { recursive: true });
    }

    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const filepath = path.join(businessDir, filename);
    fs.writeFileSync(filepath, file.buffer);

    // Return a URL path that can be served
    return `/uploads/facebook/${businessId}/${filename}`;
  }

  /**
   * Upload media to Facebook via Graph API using a URL
   * For video: media_type=VIDEO, video_url=url
   * For image: photo_url=url
   */
  static async createMediaContainer(
    businessId: string,
    options: {
      mediaUrl: string;
      caption: string;
      mediaType?: 'IMAGE' | 'VIDEO';
      isCarouselChild?: boolean;
    }
  ) {
    const { fbPageId, accessToken } = await getFacebookCredentials(businessId);
    const { mediaUrl, caption, mediaType = 'IMAGE', isCarouselChild = false } = options;

    const params: Record<string, any> = {
      access_token: accessToken,
    };

    if (mediaType === 'VIDEO') {
      params.media_type = 'VIDEO';
      params.video_url = mediaUrl;
    } else {
      params.url = mediaUrl; // For images, use 'url' parameter
    }

    // Only set caption for non-carousel children
    if (!isCarouselChild && caption) {
      params.caption = caption;
    }

    const { data } = await axios.post(`${GRAPH_API_BASE}/${fbPageId}/media`, params);
    return data; // { id: "creation_id" }
  }

  /**
   * Create a carousel container (for multiple media items in one post)
   * Step 1: Create children containers
   * Step 2: Create parent carousel container
   */
  static async createCarouselContainer(
    businessId: string,
    options: {
      children: Array<{ mediaUrl: string; mediaType?: 'IMAGE' | 'VIDEO' }>;
      caption: string;
    }
  ) {
    const { fbPageId, accessToken } = await getFacebookCredentials(businessId);
    const { children, caption } = options;

    // Step 1: Create individual child containers
    const childIds: string[] = [];
    for (const child of children) {
      const result = await FacebookService.createMediaContainer(businessId, {
        mediaUrl: child.mediaUrl,
        caption: '', // Children don't get captions
        mediaType: child.mediaType || 'IMAGE',
        isCarouselChild: true,
      });
      childIds.push(result.id);

      // Small delay between child creations
      await delay(1000);
    }

    // Step 2: Create carousel container
    // Wait a moment for children to be processed
    await delay(2000);

    const { data } = await axios.post(`${GRAPH_API_BASE}/${fbPageId}/media`, {
      media_type: 'CAROUSEL',
      children: childIds,
      caption,
      access_token: accessToken,
    });

    return {
      creationId: data.id,
      childIds,
    };
  }

  /**
   * Check if a media container is ready to publish
   * Facebook returns status "FINISHED" when ready
   */
  static async checkContainerStatus(businessId: string, creationId: string) {
    const { accessToken } = await getFacebookCredentials(businessId);

    const { data } = await axios.get(`${GRAPH_API_BASE}/${creationId}`, {
      params: {
        fields: 'id,status,error_code,error_message',
        access_token: accessToken,
      },
    });

    return data;
  }

  /**
   * Wait for container to be ready (poll until FINISHED or FAILED)
   */
  static async waitForContainer(
    businessId: string,
    creationId: string,
    maxRetries = 10,
    pollIntervalMs = 3000
  ) {
    for (let i = 0; i < maxRetries; i++) {
      const status = await this.checkContainerStatus(businessId, creationId);

      if (status.status === 'FINISHED') {
        return { ready: true, status };
      }

      if (status.status === 'ERROR' || status.error_code) {
        throw new Error(`Container processing failed: ${status.error_message || 'Unknown error'}`);
      }

      if (i < maxRetries - 1) {
        await delay(pollIntervalMs);
      }
    }

    throw new Error('Container did not finish processing in time. Try again later.');
  }

  /**
   * Publish a media container to Facebook
   */
  static async publishContainer(businessId: string, creationId: string) {
    const { fbPageId, accessToken } = await getFacebookCredentials(businessId);

    const { data } = await axios.post(`${GRAPH_API_BASE}/${fbPageId}/media_publish`, {
      creation_id: creationId,
      access_token: accessToken,
    });

    return data; // { id: "fb_media_id" }
  }

  /**
   * Full single-media publish flow:
   * 1. Create container → 2. Wait for processing → 3. Publish
   */
  static async publishMedia(
    businessId: string,
    options: {
      mediaUrl: string;
      caption: string;
      mediaType?: 'IMAGE' | 'VIDEO';
    }
  ) {
    const { mediaUrl, caption, mediaType = 'IMAGE' } = options;

    // Step 1: Create media container
    const container = await this.createMediaContainer(businessId, {
      mediaUrl,
      caption,
      mediaType,
    });

    // Step 2: Wait for container to be ready
    await this.waitForContainer(businessId, container.id);

    // Step 3: Publish
    const result = await this.publishContainer(businessId, container.id);

    return {
      containerId: container.id,
      mediaId: result.id,
    };
  }

  /**
   * Full carousel publish flow:
   * 1. Create child containers → 2. Create carousel container → 3. Wait → 4. Publish
   */
  static async publishCarousel(
    businessId: string,
    options: {
      children: Array<{ mediaUrl: string; mediaType?: 'IMAGE' | 'VIDEO' }>;
      caption: string;
    }
  ) {
    // Step 1 & 2: Create carousel (children + parent)
    const carousel = await this.createCarouselContainer(businessId, options);

    // Step 3: Wait for carousel container to be ready
    await this.waitForContainer(businessId, carousel.creationId);

    // Step 4: Publish
    const result = await this.publishContainer(businessId, carousel.creationId);

    return {
      childIds: carousel.childIds,
      containerId: carousel.creationId,
      mediaId: result.id,
    };
  }

  /**
   * Publish from an existing Post record (with mediaUrls)
   * Detects single vs carousel and handles accordingly
   */
  static async publishPost(
    businessId: string,
    post: {
      id: string;
      content: string;
      mediaUrls: string[];
    }
  ) {
    const { content, mediaUrls } = post;

    if (!mediaUrls || mediaUrls.length === 0) {
      throw new Error('Facebook requires at least one image or video. Add media to your post first.');
    }

    let publishResult;

    if (mediaUrls.length === 1) {
      // Single media
      const isVideo = mediaUrls[0].match(/\.(mp4|mov|avi|mkv|webm)$/i);
      publishResult = await this.publishMedia(businessId, {
        mediaUrl: mediaUrls[0],
        caption: content,
        mediaType: isVideo ? 'VIDEO' : 'IMAGE',
      });
    } else {
      // Carousel (multiple media items)
      const children = mediaUrls.map(url => ({
        mediaUrl: url,
        mediaType: url.match(/\.(mp4|mov|avi|mkv|webm)$/i) ? 'VIDEO' as const : 'IMAGE' as const,
      }));
      publishResult = await this.publishCarousel(businessId, {
        children,
        caption: content,
      });
    }

    // Update the Post record with published Facebook ID
    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: 'published',
        publishedAt: new Date(),
        publishedIds: {
          facebook: publishResult.mediaId,
        },
      },
    });

    return publishResult;
  }

  /**
   * Get media insights (likes, comments, reach, etc.)
   */
  static async getMediaInsights(businessId: string, mediaId: string) {
    const { accessToken } = await getFacebookCredentials(businessId);

    const { data } = await axios.get(`${GRAPH_API_BASE}/${mediaId}/insights`, {
      params: {
        metric: 'post_impressions,post_engaged_users,post_clicks,post_reactions_like_total,post_comments',
        access_token: accessToken,
      },
    });

    return data;
  }

  /**
   * Get recent media from the Facebook Page
   */
  static async getRecentMedia(businessId: string, limit = 20) {
    const { fbPageId, accessToken } = await getFacebookCredentials(businessId);

    const { data } = await axios.get(`${GRAPH_API_BASE}/${fbPageId}/posts`, {
      params: {
        fields: 'id,message,full_picture,created_time,likes.summary(true),comments.summary(true),shares,permalink_url',
        limit,
        access_token: accessToken,
      },
    });

    return data.data || [];
  }

  /**
   * Test if Facebook credentials are valid
   */
  static async testConnection(businessId: string) {
    try {
      const { fbPageId, accessToken } = await getFacebookCredentials(businessId);

      await axios.get(`${GRAPH_API_BASE}/${fbPageId}`, {
        params: {
          fields: 'id,name',
          access_token: accessToken,
        },
      });

      return { connected: true };
    } catch (error: any) {
      return {
        connected: false,
        error: error?.response?.data?.error?.message || error.message,
      };
    }
  }
}