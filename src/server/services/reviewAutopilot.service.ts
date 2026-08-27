/**
 * Review autopilot (rule-based sentiment, no external AI).
 *
 * Classifies a review's sentiment with keyword scoring, then routes it:
 *   - negative  → create a SupportTicket (or Notification fallback) + emit event
 *   - positive  → mark handled
 *   - neutral   → flag for human approval
 *
 * All DB writes are guarded so missing models degrade to a safe result
 * instead of throwing.
 */

import { prisma } from '../db.js';
import { emitEvent } from '../events/eventBus.js';
import logger from '../utils/logger.js';

export type Sentiment = 'positive' | 'neutral' | 'negative';

const POSITIVE_WORDS = [
  'good', 'great', 'excellent', 'amazing', 'love', 'best', 'awesome', 'happy',
  'satisfied', 'perfect', 'wonderful', 'fantastic', 'recommend', 'thanks', 'thank you',
  'superb', 'outstanding', 'brilliant', 'nice', 'pleased', 'helpful', 'fast', 'easy',
];

const NEGATIVE_WORDS = [
  'bad', 'worst', 'terrible', 'awful', 'hate', 'poor', 'slow', 'broken', 'fail',
  'failed', 'issue', 'problem', 'complaint', 'rude', 'angry', 'disappointed',
  'useless', 'wrong', 'error', 'scam', 'refund', 'cancel', 'late', 'expensive',
  'horrible', 'not working', 'waste', 'never',
];

/**
 * Rule-based sentiment classification. Counts positive vs negative keywords and
 * maps the normalized difference to a score in [-1, 1].
 */
export async function classifyReview(text: string): Promise<{ sentiment: Sentiment; score: number }> {
  const lower = (text || '').toLowerCase();
  let pos = 0;
  let neg = 0;

  for (const w of POSITIVE_WORDS) {
    if (lower.includes(w)) pos += 1;
  }
  for (const w of NEGATIVE_WORDS) {
    if (lower.includes(w)) neg += 1;
  }

  // Normalize: (pos - neg) bounded by total hits, scaled to -1..1
  const total = pos + neg;
  const score = total === 0 ? 0 : Math.max(-1, Math.min(1, (pos - neg) / total));

  let sentiment: Sentiment;
  if (score > 0.15) sentiment = 'positive';
  else if (score < -0.15) sentiment = 'negative';
  else sentiment = 'neutral';

  return { sentiment, score: Number(score.toFixed(3)) };
}

export interface ReviewHandleResult {
  sentiment: Sentiment;
  action: 'published_reply' | 'task_created' | 'needs_approval';
  taskId?: string;
}

async function resolveOwnerId(businessId: string): Promise<string | null> {
  try {
    const owner = await (prisma as any).user.findFirst({
      where: { businessId, role: 'OWNER' },
      select: { id: true },
    });
    return owner?.id || null;
  } catch {
    return null;
  }
}

/**
 * Handle a review: classify it, then route by sentiment.
 */
export async function handleReview(
  businessId: string,
  reviewId: string,
  text: string
): Promise<ReviewHandleResult> {
  const { sentiment } = await classifyReview(text);

  if (sentiment === 'negative') {
    try {
      const ticketDelegate = (prisma as any).supportTicket;
      if (ticketDelegate) {
        const count = await ticketDelegate.count({ where: { businessId } }).catch(() => 0);
        const ticketNumber = `RV-${Date.now().toString().slice(-6)}-${(count + 1)}`;
        const ticket = await ticketDelegate.create({
          data: {
            businessId,
            ticketNumber,
            name: `Negative review ${reviewId}`,
            subject: 'Negative review requires follow-up',
            description: text,
            category: 'review',
            priority: 'high',
            status: 'open',
          },
        });
        await markReviewHandled(reviewId, businessId);
        await emitEvent(
          'review.received',
          { businessId, reviewId, sentiment, ticketId: ticket.id },
          { businessId }
        ).catch(() => {});
        return { sentiment, action: 'task_created', taskId: ticket.id };
      }

      // Fallback: notify the business owner via a Notification row.
      const ownerId = await resolveOwnerId(businessId);
      const notifDelegate = (prisma as any).notification;
      if (ownerId && notifDelegate) {
        const notif = await notifDelegate.create({
          data: {
            userId: ownerId,
            businessId,
            type: 'review_alert',
            title: 'Negative review needs attention',
            message: text,
            entityType: 'Review',
            entityId: reviewId,
          },
        });
        await markReviewHandled(reviewId, businessId);
        await emitEvent(
          'review.received',
          { businessId, reviewId, sentiment, notificationId: notif.id },
          { businessId }
        ).catch(() => {});
        return { sentiment, action: 'task_created', taskId: notif.id };
      }
    } catch (err: any) {
      logger.error('[reviewAutopilot] negative review handling failed', { businessId, reviewId, error: err?.message });
    }
    return { sentiment, action: 'needs_approval' };
  }

  if (sentiment === 'positive') {
    await markReviewHandled(reviewId, businessId);
    return { sentiment, action: 'published_reply' };
  }

  // Neutral → needs human approval
  try {
    await emitEvent(
      'review.received',
      { businessId, reviewId, sentiment },
      { businessId }
    ).catch(() => {});
  } catch { /* non-critical */ }

  return { sentiment, action: 'needs_approval' };
}

async function markReviewHandled(reviewId: string, businessId: string): Promise<void> {
  const reviewDelegate = (prisma as any).review;
  if (!reviewDelegate) return;
  try {
    await reviewDelegate.update({
      where: { id: reviewId },
      data: { replyStatus: 'handled', isRead: true },
    });
  } catch (err: any) {
    logger.warn('[reviewAutopilot] could not mark review handled', { reviewId, error: err?.message });
  }
}
