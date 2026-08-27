import { prisma } from '../db.js';
import logger from '../utils/logger.js';
import { emitEvent } from '../events/eventBus.js';

export type ChurnRisk = 'healthy' | 'at_risk' | 'critical';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Compute a rule-based churn risk for a single customer (contact).
 *
 * Rules:
 *  - inactivity (no message/lead/subscription activity) > 60d  -> critical
 *  - inactivity > 30d                                          -> at_risk
 *  - negative review (rating <= 2)                             -> critical
 *  - failed/cancelled payment (subscription)                   -> critical
 *  - otherwise                                                 -> healthy
 *
 * Every prisma query is isolated in its own try/catch so a missing model
 * or unexpected schema shape never bubbles up as a thrown error.
 */
export async function scoreCustomer(
  businessId: string,
  contactId: string
): Promise<{
  contactId: string;
  risk: ChurnRisk;
  reasons: string[];
  lastActivityAt?: Date;
}> {
  const reasons: string[] = [];
  let lastActivityAt: Date | undefined;
  let risk: ChurnRisk = 'healthy';

  // 1. Last activity from messages (direction-agnostic)
  try {
    const lastMsg = await prisma.message.findFirst({
      where: { businessId, contactId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (lastMsg?.createdAt) {
      lastActivityAt = lastMsg.createdAt;
    }
  } catch (err) {
    logger.debug('[churn] message lookup skipped', { error: String(err) });
  }

  // 2. Last activity from leads (if any)
  try {
    const lastLead = await prisma.lead.findFirst({
      where: { businessId, contactId },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });
    if (lastLead?.updatedAt && (!lastActivityAt || lastLead.updatedAt > lastActivityAt)) {
      lastActivityAt = lastLead.updatedAt;
    }
  } catch (err) {
    logger.debug('[churn] lead lookup skipped', { error: String(err) });
  }

  // 3. Inactivity-based risk
  if (lastActivityAt) {
    const inactiveDays = (Date.now() - lastActivityAt.getTime()) / DAY_MS;
    if (inactiveDays > 60) {
      risk = 'critical';
      reasons.push(`No activity for ${Math.floor(inactiveDays)} days`);
    } else if (inactiveDays > 30) {
      risk = 'at_risk';
      reasons.push(`No activity for ${Math.floor(inactiveDays)} days`);
    }
  } else {
    reasons.push('No recorded activity');
    risk = 'at_risk';
  }

  // 4. Negative review (rating <= 2)
  try {
    const review = await prisma.productReview.findFirst({
      where: { businessId, contactId, rating: { lte: 2 } },
      select: { rating: true },
    });
    if (review) {
      risk = 'critical';
      reasons.push(`Negative review (rating ${review.rating})`);
    }
  } catch (err) {
    logger.debug('[churn] productReview lookup skipped', { error: String(err) });
  }

  // 5. Failed / cancelled payment (subscription-level signal)
  try {
    const failingSub = await prisma.subscription.findFirst({
      where: {
        businessId,
        status: { in: ['failed', 'past_due', 'cancelled'] },
      },
      select: { status: true },
    });
    if (failingSub) {
      risk = 'critical';
      reasons.push(`Payment issue (subscription ${failingSub.status})`);
    }
  } catch (err) {
    logger.debug('[churn] subscription lookup skipped', { error: String(err) });
  }

  if (risk !== 'healthy') {
    try {
      await emitEvent(
        'churn.detected',
        { businessId, contactId, risk, reasons },
        { businessId }
      );
    } catch (err) {
      logger.debug('[churn] emitEvent skipped', { error: String(err) });
    }
  }

  return { contactId, risk, reasons, lastActivityAt };
}

/**
 * Scan recent contacts for a business and return those flagged at_risk/critical.
 * Safe: individual scoring failures are swallowed so one bad contact never
 * aborts the whole scan.
 */
export async function flagAtRisk(
  businessId: string
): Promise<{ contactId: string; risk: ChurnRisk }[]> {
  const flagged: { contactId: string; risk: ChurnRisk }[] = [];

  let contactIds: string[] = [];
  try {
    const contacts = await prisma.contact.findMany({
      where: { businessId, status: 'active' },
      select: { id: true },
      take: 500,
      orderBy: { lastActivity: 'desc' },
    });
    contactIds = contacts.map((c) => c.id);
  } catch (err) {
    logger.error('[churn] contact scan failed', { error: String(err) });
    return flagged;
  }

  for (const contactId of contactIds) {
    try {
      const result = await scoreCustomer(businessId, contactId);
      if (result.risk !== 'healthy') {
        flagged.push({ contactId, risk: result.risk });
      }
    } catch (err) {
      logger.debug('[churn] scoreCustomer skipped for contact', {
        contactId,
        error: String(err),
      });
    }
  }

  return flagged;
}
