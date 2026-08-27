/**
 * Social publishing engine (best-effort, dependency-free).
 *
 * Publishes a post to a connected social platform via its API, or reports that
 * no account is connected. NEVER throws — all failures are returned as a result
 * object so callers (routes, automations) can handle them gracefully.
 *
 * NOTE: A `SocialAccount` model is not present in the current schema, so the
 * connected-account lookup is guarded and gracefully reports
 * 'no connected account' when the delegate is absent. The platform API call
 * is implemented with the global `fetch` and wrapped in try/catch.
 */

import { prisma } from '../db.js';
import { emitEvent } from '../events/eventBus.js';
import logger from '../utils/logger.js';

export type SocialPlatform = 'facebook' | 'instagram' | 'linkedin' | 'x' | 'google_business';

export interface PublishOptions {
  platform: SocialPlatform;
  content: string;
  mediaUrl?: string;
  scheduledAt?: string;
}

export interface PublishResult {
  ok: boolean;
  postId?: string;
  error?: string;
}

const PLATFORMS: SocialPlatform[] = ['facebook', 'instagram', 'linkedin', 'x', 'google_business'];

function endpointFor(platform: SocialPlatform, token: string): string | null {
  switch (platform) {
    case 'facebook':
      return `https://graph.facebook.com/v19.0/me/feed?access_token=${encodeURIComponent(token)}`;
    case 'instagram':
      return `https://graph.facebook.com/v19.0/me/media?access_token=${encodeURIComponent(token)}`;
    case 'linkedin':
      return 'https://api.linkedin.com/v2/ugcPosts';
    case 'x':
      return 'https://api.twitter.com/2/tweets';
    case 'google_business':
      return 'https://mybusiness.googleapis.com/v4/localPosts';
    default:
      return null;
  }
}

/**
 * Find a connected SocialAccount row for a platform + business, if the model
 * exists in the schema. Returns null when the model is absent or no row found.
 */
async function findAccount(
  businessId: string,
  platform: SocialPlatform
): Promise<{ token: string; accountId?: string } | null> {
  const delegate = (prisma as any).socialAccount;
  if (!delegate) return null;
  try {
    const row = await delegate.findFirst({
      where: { businessId, platform },
      select: { token: true, accountId: true },
    });
    if (!row || !row.token) return null;
    return { token: row.token, accountId: row.accountId };
  } catch (err: any) {
    logger.warn('[socialEngine] socialAccount lookup failed', { businessId, platform, error: err?.message });
    return null;
  }
}

/**
 * Publish a post to a social platform. Best-effort: if no connected account
 * exists (or the SocialAccount model is absent), returns ok:false with a clear
 * error. On success emits `social.post.published`.
 */
export async function publishPost(
  businessId: string,
  opts: PublishOptions
): Promise<PublishResult> {
  try {
    const account = await findAccount(businessId, opts.platform);
    if (!account) {
      logger.info('[socialEngine] publish skipped — no connected account', {
        businessId,
        platform: opts.platform,
      });
      return { ok: false, error: 'no connected account' };
    }

    const url = endpointFor(opts.platform, account.token);
    if (!url) {
      return { ok: false, error: `unsupported platform: ${opts.platform}` };
    }

    const body: Record<string, unknown> = {
      message: opts.content,
      text: opts.content,
    };
    if (opts.mediaUrl) body.media_url = opts.mediaUrl;
    if (opts.scheduledAt) body.scheduled_publish_time = opts.scheduledAt;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn('[socialEngine] platform API rejected post', {
        businessId,
        platform: opts.platform,
        status: res.status,
        detail: text.slice(0, 200),
      });
      return { ok: false, error: `platform returned ${res.status}` };
    }

    const data: any = await res.json().catch(() => ({}));
    const postId = data?.id || data?.id_ || data?.post_id || undefined;

    logger.info('[socialEngine] post published', {
      businessId,
      platform: opts.platform,
      postId,
    });

    await emitEvent(
      'social.post.published',
      {
        businessId,
        platform: opts.platform,
        postId,
        content: opts.content,
        mediaUrl: opts.mediaUrl ?? null,
        scheduledAt: opts.scheduledAt ?? null,
      },
      { businessId }
    ).catch(() => {});

    return { ok: true, postId };
  } catch (err: any) {
    logger.error('[socialEngine] publish failed', {
      businessId,
      platform: opts.platform,
      error: err?.message,
    });
    return { ok: false, error: err?.message || 'publish failed' };
  }
}

/**
 * Return which platforms have a connected account for the business.
 * A platform maps to `true` only when a SocialAccount row with a token exists.
 * When the SocialAccount model is absent, all platforms are reported false.
 */
export async function getPlatformStatus(
  businessId: string
): Promise<Record<string, boolean>> {
  const delegate = (prisma as any).socialAccount;
  const status: Record<string, boolean> = {};

  if (!delegate) {
    for (const p of PLATFORMS) status[p] = false;
    return status;
  }

  try {
    const rows = await delegate.findMany({
      where: { businessId },
      select: { platform: true, token: true },
    });
    const connected = new Set(
      (rows as any[]).filter((r) => r?.token).map((r) => r.platform)
    );
    for (const p of PLATFORMS) status[p] = connected.has(p);
  } catch (err: any) {
    logger.warn('[socialEngine] platform status lookup failed', { businessId, error: err?.message });
    for (const p of PLATFORMS) status[p] = false;
  }

  return status;
}
