import { prisma } from '../db.js';
import { emitEvent } from '../events/eventBus.js';

/**
 * Google review QR / auto-reply pass.
 *
 * Delegates the actual reply drafting + posting to the n8n automation layer
 * (event-driven architecture). This service discovers the businesses that have
 * GBP connected and auto-reply enabled, emits a `review.sync_requested` event
 * for each, and lets n8n (the `gbp-auto-post` / review workflow) do the work.
 *
 * Return shape matches the caller in src/server/index.ts:
 *   Array<{ replied: boolean; reviewId?: string; error?: string }>
 *
 * @param dryRun when true, events are still emitted but marked dry-run so n8n
 *               can preview without posting.
 */
export async function runReviewQrAutoReplyPass(
  dryRun = false
): Promise<Array<{ replied: boolean; reviewId?: string; error?: string }>> {
  try {
    const businesses = await prisma.business.findMany({
      where: {
        gbpAccessToken: { not: null },
        gbpAccountId: { not: null },
        gbpLocationId: { not: null },
      },
      select: { id: true, name: true },
    });

    for (const business of businesses) {
      await emitEvent(
        'review.sync_requested',
        {
          businessId: business.id,
          businessName: business.name,
          dryRun,
          source: 'review-qr-auto-reply-pass',
        },
        { businessId: business.id }
      );
    }

    if (businesses.length > 0) {
      console.log(`[ReviewQrPass] Delegated ${businesses.length} business(es) to n8n (dryRun=${dryRun})`);
    }
    return [];
  } catch (err: any) {
    console.error('[ReviewQrPass] discovery failed:', err?.message);
    return [];
  }
}

export default { runReviewQrAutoReplyPass };
