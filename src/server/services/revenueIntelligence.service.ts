import { prisma } from '../db.js';
import logger from '../utils/logger.js';

// Statuses considered "closed" (won or lost) for pipeline math.
const WON_STATUSES = ['won', 'closed_won', 'converted'];
const LOST_STATUSES = ['lost', 'closed_lost'];
const CLOSED_STATUSES = [...WON_STATUSES, ...LOST_STATUSES, 'closed'];

function isClosed(status: string): boolean {
  const s = status.toLowerCase();
  return CLOSED_STATUSES.some((c) => s.includes(c));
}

/**
 * Aggregate pipeline / revenue intelligence for a business over a window.
 *
 * NOTE: This CRM has a `Lead` model but NO dedicated `Deal` model. We treat
 * `Lead` as the pipeline entity and `Contact.dealValue` as the deal value.
 * All queries are wrapped individually so a missing column/model never throws.
 */
export async function pipelineSummary(
  businessId: string,
  sinceDays = 30
): Promise<{
  newLeads: number;
  wonLeads: number;
  lostLeads: number;
  revenue: number;
  pipelineValue: number;
  conversionRate: number;
  topSource?: string;
  stuckDeals: number;
}> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const stuckThreshold = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  let newLeads = 0;
  let wonLeads = 0;
  let lostLeads = 0;
  let revenue = 0;
  let pipelineValue = 0;
  let topSource: string | undefined;
  let stuckDeals = 0;

  // New / won / lost lead counts in window
  try {
    const leads = await prisma.lead.findMany({
      where: { businessId, createdAt: { gte: since } },
      select: { status: true, source: true },
    });
    newLeads = leads.length;
    for (const l of leads) {
      const s = l.status.toLowerCase();
      if (WON_STATUSES.some((w) => s.includes(w))) wonLeads++;
      else if (LOST_STATUSES.some((x) => s.includes(x))) lostLeads++;
    }
  } catch (err) {
    logger.debug('[revenue] lead summary skipped', { error: String(err) });
  }

  // Top lead source
  try {
    const grouped = await prisma.lead.groupBy({
      by: ['source'],
      where: { businessId, createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { source: 'desc' } },
      take: 1,
    });
    if (grouped.length > 0) topSource = grouped[0].source;
  } catch (err) {
    logger.debug('[revenue] topSource skipped', { error: String(err) });
  }

  // Pipeline value + stuck deals (contacts still in pipeline)
  try {
    const contacts = await prisma.contact.findMany({
      where: {
        businessId,
        pipelineId: { not: null },
        status: 'active',
      },
      select: { dealValue: true, updatedAt: true, lastActivity: true },
    });
    for (const c of contacts) {
      pipelineValue += c.dealValue || 0;
      const ref = c.lastActivity || c.updatedAt;
      if (ref && ref < stuckThreshold) stuckDeals++;
    }
  } catch (err) {
    logger.debug('[revenue] pipeline value skipped', { error: String(err) });
  }

  // Stuck leads (Lead rows, not closed, stale updatedAt)
  try {
    const staleLeads = await prisma.lead.findMany({
      where: {
        businessId,
        updatedAt: { lt: stuckThreshold },
      },
      select: { status: true },
    });
    stuckDeals += staleLeads.filter((l) => !isClosed(l.status)).length;
  } catch (err) {
    logger.debug('[revenue] stuck leads skipped', { error: String(err) });
  }

  // Revenue proxy: subscription amounts for the business
  try {
    const subs = await prisma.subscription.findMany({
      where: { businessId, status: { in: ['active', 'trialing', 'past_due'] } },
      select: { amount: true },
    });
    revenue = subs.reduce((sum, s) => sum + (s.amount || 0), 0);
  } catch (err) {
    logger.debug('[revenue] revenue skipped', { error: String(err) });
  }

  const conversionRate = newLeads > 0 ? (wonLeads / newLeads) * 100 : 0;

  return {
    newLeads,
    wonLeads,
    lostLeads,
    revenue,
    pipelineValue,
    conversionRate: Math.round(conversionRate * 100) / 100,
    topSource,
    stuckDeals,
  };
}

/**
 * Group pipeline contacts by assigned sales rep and count their pending leads.
 *
 * `Lead` has no `assignedTo`, so we group on `Contact.assignedTo` (the rep id)
 * and count contacts that are still active in a pipeline.
 */
export async function salesRepPerformance(
  businessId: string
): Promise<{ salesRepId: string; pendingLeads: number }[]> {
  let rows: { assignedTo: string | null }[] = [];
  try {
    rows = await prisma.contact.findMany({
      where: {
        businessId,
        assignedTo: { not: null },
        status: 'active',
        pipelineId: { not: null },
      },
      select: { assignedTo: true },
    });
  } catch (err) {
    logger.debug('[revenue] salesRepPerformance skipped', { error: String(err) });
    return [];
  }

  const counts = new Map<string, number>();
  for (const r of rows) {
    const rep = r.assignedTo as string;
    if (!rep) continue;
    counts.set(rep, (counts.get(rep) || 0) + 1);
  }

  return Array.from(counts.entries()).map(([salesRepId, pendingLeads]) => ({
    salesRepId,
    pendingLeads,
  }));
}
