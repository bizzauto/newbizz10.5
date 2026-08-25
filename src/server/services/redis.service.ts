import IORedis from 'ioredis';

let redisClient: IORedis | null = null;
let isConnected = false;
let redisDisabled = false;
let connectionAttempted = false;
/** Global — once set, ALL Redis activity stops immediately with no retries */
let redisUnreachable = false;

function maskUrl(url: string): string {
  try {
    return url.replace(/rediss?:\/\/.*@/, (match) => {
      return match.startsWith('rediss://') ? 'rediss://***@' : 'redis://***@';
    });
  } catch {
    return 'invalid-url';
  }
}

export async function initRedis(): Promise<IORedis | null> {
  if (redisDisabled) return null;
  if (connectionAttempted && !redisClient) {
    // Prevent cascade — if a previous attempt failed, don't retry
    return null;
  }
  if (redisClient && isConnected) {
    return redisClient;
  }
  connectionAttempted = true;

  const redisUrl = process.env.REDIS_URL;
  const password = process.env.REDIS_PASSWORD || undefined;
  const redisEnabled = process.env.REDIS_ENABLED;
  const redisHost = process.env.REDIS_HOST;
  const redisPort = process.env.REDIS_PORT;
  // Coolify sometimes injects the full Redis URL into REDIS_USERNAME by mistake
  const redisUsername = process.env.REDIS_USERNAME;

  console.log(`[Redis Service] REDIS_URL: ${redisUrl ? `SET (${maskUrl(redisUrl)})` : 'NOT SET'}, REDIS_PASSWORD: ${password ? 'SET' : 'NOT SET'}, REDIS_HOST: ${redisHost || 'NOT SET'}, REDIS_PORT: ${redisPort || 'NOT SET'}, REDIS_ENABLED: ${redisEnabled || 'NOT SET'}`);

  // NUCLEAR: Redis is completely disabled unless REDIS_ENABLED=true
  // This prevents Coolify auto-injected env vars from causing connection timeouts
  // Note: We do NOT auto-enable even if Coolify injects a URL into REDIS_USERNAME.
  // The user must explicitly set REDIS_ENABLED=true to confirm Redis should be used.
  if (!redisEnabled) {
    console.log('[Redis Service] REDIS_ENABLED not set to true — Redis disabled entirely. Set REDIS_ENABLED=true in env to enable.');
    redisDisabled = true;
    return null;
  }

  // Check if REDIS_USERNAME contains a full Redis URL (Coolify quirk)
  const effectiveUrl = (redisUrl && redisUrl.includes('@')) ? redisUrl
    : (redisUsername && redisUsername.startsWith('redis://')) ? redisUsername
    : null;

  if (effectiveUrl) {
    console.log(`[Redis Service] Effective URL: ${maskUrl(effectiveUrl)}`);
  }

  // Require credentials for security
  if (!password && !effectiveUrl && !redisHost) {
    console.log('[Redis Service] REDIS_ENABLED but no Redis credentials provided.');
    redisDisabled = true;
    return null;
  }

  if (!effectiveUrl && !password) {
    console.log('[Redis Service] No credentials - skipping');
    redisDisabled = true;
    return null;
  }

  if (effectiveUrl && !effectiveUrl.includes('@')) {
    console.log('[Redis Service] REDIS_URL has no password (no @) — Redis disabled');
    redisDisabled = true;
    return null;
  }

  if (effectiveUrl) {
    const schemeFree = effectiveUrl.replace(/^rediss?:\/\//, '');
    const passwordPart = schemeFree.split('@')[0];
    if (!passwordPart || passwordPart === ':' || passwordPart === '') {
      console.log('[Redis Service] REDIS_URL has empty password — Redis disabled');
      redisDisabled = true;
      return null;
    }
  }

  if (!redisUrl && !redisHost) {
    console.log('[Redis Service] No URL or host — Redis disabled');
    redisDisabled = true;
    return null;
  }

  try {
    const host = redisHost || 'coolify-redis';
    const port = redisPort || '6379';

    const finalUrl = effectiveUrl || `redis://:${password}@${host}:${port}`;

    // Parse timeout overrides from env vars
    const cmdTimeout = parseInt(process.env.REDIS_COMMAND_TIMEOUT || '8000', 10);
    const connTimeout = parseInt(process.env.REDIS_CONNECT_TIMEOUT || '8000', 10);
    console.log(`[Redis Service] Connecting to ${host}:${port}... Timeouts — connect: ${connTimeout}ms, command: ${cmdTimeout}ms. Set REDIS_CONNECT_TIMEOUT / REDIS_COMMAND_TIMEOUT to override.`);

    redisClient = new IORedis(finalUrl, {
      maxRetriesPerRequest: null,
      retryStrategy(times: number) {
        if (redisDisabled || redisUnreachable || times > 5) return null;
        // If we're retrying, it means connection failed — mark as unreachable
        // to prevent retries and cascade connections from other modules
        if (times >= 2) {
          console.log('[Redis Service] ⛔ Multiple connection attempts failed — marking Redis as unreachable. No further retries.');
          redisUnreachable = true;
          return null;
        }
        const delay = Math.min(times * 500, 3000);
        console.log(`[Redis Service] Retry #${times + 1} in ${delay}ms...`);
        return delay;
      },
      enableOfflineQueue: false,
      connectTimeout: connTimeout,
      commandTimeout: cmdTimeout,
      lazyConnect: true,
    });

    redisClient.on('error', (err: any) => {
      if (err.message?.includes('NOAUTH') || err.message?.includes('AUTH') || err.message?.includes('WRONGPASS')) {
        console.error('[Redis Service] Auth failed — credentials rejected. Check REDIS_PASSWORD or REDIS_URL credentials. Redis permanently disabled.');
        redisDisabled = true;
        isConnected = false;
        try { redisClient?.destroy(); } catch {}
        redisClient = null;
        return;
      }
      if (err?.message?.includes('timed out')) {
        console.error(`[Redis Service] ⏱ Command timed out after ${cmdTimeout}ms. Redis marked UNREACHABLE — no further Redis activity. Error: ${err.message}`);
        redisUnreachable = true;
        redisDisabled = true;
        isConnected = false;
        try { redisClient?.destroy(); } catch {}
        redisClient = null;
      } else {
        console.error(`[Redis Service] Error: ${err.message}`);
      }
      isConnected = false;
    });

    redisClient.on('connect', () => {
      console.log('[Redis Service] ✅ TCP connected, waiting for ready...');
    });

    redisClient.on('ready', () => {
      console.log('[Redis Service] ✅ Connected and ready — Redis is operational');
      isConnected = true;
      redisDisabled = false;
      redisUnreachable = false;
    });

    redisClient.on('close', () => {
      isConnected = false;
    });

    redisClient.on('reconnecting', () => {
      console.log('[Redis Service] Reconnecting...');
    });

    redisClient.on('reconnected', () => {
      console.log('[Redis Service] ✅ Reconnected successfully');
      isConnected = true;
      redisUnreachable = false;
    });

    redisClient.connect().catch((err: any) => {
      if (err.message?.includes('NOAUTH') || err.message?.includes('AUTH') || err.message?.includes('WRONGPASS')) {
        console.error('[Redis Service] Auth rejected on connect — credentials wrong. Check REDIS_PASSWORD or REDIS_URL.');
        redisDisabled = true;
      } else if (err?.message?.includes('timed out') || err?.message?.includes('ETIMEDOUT')) {
        console.error(`[Redis Service] ⏱ Connection timed out after ${connTimeout}ms. Redis marked UNREACHABLE — no further Redis activity. Check that Redis is running and reachable. Set REDIS_ENABLED=false in env vars to fully disable. Error: ${err.message}`);
        redisUnreachable = true;
      } else {
        console.error(`[Redis Service] Connect failed: ${err.message}`);
      }
      isConnected = false;
      try { redisClient?.destroy(); } catch {}
      redisClient = null;
    });

    return redisClient;
  } catch (err: any) {
    console.error(`[Redis Service] Failed: ${err.message}`);
    redisDisabled = true;
    return null;
  }
}

export function getRedisClient(): IORedis | null {
  return redisClient;
}

// Cache helpers
export const cacheHelpers = {
  // Get with expiration
  async getOrSet<T>(
    key: string,
    callback: () => Promise<T>,
    expirationSeconds: number = 300
  ): Promise<T> {
    if (!redisClient || !isConnected) {
      return callback();
    }

    try {
      const cached = await redisClient.get(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }

      const data = await callback();
      if (data) {
        await redisClient.setex(key, expirationSeconds, JSON.stringify(data));
      }
      return data;
    } catch (error) {
      console.error('Cache error:', error);
      return callback();
    }
  },

  // Invalidate pattern
  async invalidatePattern(pattern: string): Promise<void> {
    if (!redisClient || !isConnected) return;

    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
        console.log(`🗑️ Invalidated ${keys.length} cache keys matching: ${pattern}`);
      }
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  },

  // User-specific cache
  async cacheUserData<T>(userId: string, key: string, data: T, ttl: number = 3600): Promise<void> {
    if (!redisClient || !isConnected) return;

    try {
      await redisClient.setex(`user:${userId}:${key}`, ttl, JSON.stringify(data));
    } catch (error) {
      console.error('User cache error:', error);
    }
  },

  async getUserData<T>(userId: string, key: string): Promise<T | null> {
    if (!redisClient || !isConnected) return null;

    try {
      const data = await redisClient.get(`user:${userId}:${key}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('User cache get error:', error);
      return null;
    }
  },

  // Business-specific cache
  async cacheBusinessData<T>(businessId: string, key: string, data: T, ttl: number = 600): Promise<void> {
    if (!redisClient || !isConnected) return;

    try {
      await redisClient.setex(`business:${businessId}:${key}`, ttl, JSON.stringify(data));
    } catch (error) {
      console.error('Business cache error:', error);
    }
  },

  async getBusinessData<T>(businessId: string, key: string): Promise<T | null> {
    if (!redisClient || !isConnected) return null;

    try {
      const data = await redisClient.get(`business:${businessId}:${key}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Business cache get error:', error);
      return null;
    }
  },

  // Rate limiting with Redis
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    if (!redisClient || !isConnected) return true;

    try {
      const current = await redisClient.incr(key);
      if (current === 1) {
        await redisClient.expire(key, windowSeconds);
      }
      return current <= limit;
    } catch (error) {
      console.error('Rate limit check error:', error);
      return true;
    }
  },
};

export default redisClient;
