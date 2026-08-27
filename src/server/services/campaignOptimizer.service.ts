/**
 * Campaign optimization service (rule-based, no external AI).
 *
 * Computes delivery / open / click / reply / conversion rates from a Campaign
 * plus its related Message rows, derives revenue / cost / ROI from Message
 * metadata, and produces textual, rule-based recommendations + suggestions.
 *
 * All queries are best-effort and never throw — missing data degrades
 * gracefully to 0 / neutral rather than failing the request.
 */

import { prisma } from '../db.js';
import logger from '../utils/logger.js';

export interface CampaignAnalysis {
  campaignId: string;
  delivery: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  conversionRate: number;
  revenue: number;
  cost: number;
  roi: number;
  recommendation: string;
}

function safeRate(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0;
  const rate = numerator / denominator;
  // Clamp to 0..1 in case counters are inconsistent
  return Math.min(1, Math.max(0, rate));
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Analyze a single campaign for a business and return computed metrics
 * plus a rule-based textual recommendation.
 */
export async function analyzeCampaign(
  businessId: string,
  campaignId: string
): Promise<CampaignAnalysis> {
  const fallback: CampaignAnalysis = {
    campaignId,
    delivery: 0,
    openRate: 0,
    clickRate: 0,
    replyRate: 0,
    conversionRate: 0,
    revenue: 0,
    cost: 0,
    roi: 0,
    recommendation: 'No campaign data available.',
  };

  let campaign: any;
  try {
    campaign = await (prisma as any).campaign.findUnique({
      where: { id: campaignId, businessId },
    });
  } catch (err: any) {
    logger.warn('[campaignOptimizer] campaign lookup failed', { campaignId, error: err?.message });
    return fallback;
  }

  if (!campaign) return fallback;

  const sent = campaign.sent || campaign.totalSent || 0;
  const delivered = campaign.delivered || campaign.totalDelivered || 0;
  const read = campaign.read || campaign.totalRead || 0;
  const clicked = campaign.clicked || 0;
  const replied = campaign.totalReplied || 0;
  const failed = campaign.failed || campaign.totalFailed || 0;

  // Revenue / cost are best-effort: read from related Message metadata.
  let revenue = 0;
  let cost = 0;
  try {
    const messages = await (prisma as any).message.findMany({
      where: { campaignId, businessId },
      select: { metadata: true },
      take: 5000,
    });
    for (const m of messages as any[]) {
      const meta = m?.metadata || {};
      const r = Number(meta.revenue);
      const c = Number(meta.cost);
      if (Number.isFinite(r)) revenue += r;
      if (Number.isFinite(c)) cost += c;
    }
  } catch (err: any) {
    logger.warn('[campaignOptimizer] message metadata aggregation failed', { campaignId, error: err?.message });
  }

  const delivery = safeRate(delivered, sent);
  const openRate = safeRate(read, delivered);
  const clickRate = safeRate(clicked, delivered);
  const replyRate = safeRate(replied, delivered);
  // Click -> reply conversion proxy (clicks that resulted in a reply)
  const conversionRate = safeRate(replied, clicked);

  const roi = cost > 0 ? (revenue - cost) / cost : revenue > 0 ? 1 : 0;

  const recommendation = buildRecommendation({
    delivery,
    openRate,
    clickRate,
    replyRate,
    conversionRate,
    roi,
    failed,
    sent,
  });

  return {
    campaignId,
    delivery,
    openRate,
    clickRate,
    replyRate,
    conversionRate,
    revenue,
    cost,
    roi,
    recommendation,
  };
}

function buildRecommendation(m: {
  delivery: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  conversionRate: number;
  roi: number;
  failed: number;
  sent: number;
}): string {
  const issues: string[] = [];

  if (m.sent > 0 && m.failed / m.sent > 0.05) {
    issues.push(`High failure rate (${pct(m.failed / Math.max(m.sent, 1))}) — verify contact numbers and template approval.`);
  }
  if (m.delivery < 0.9) {
    issues.push(`Delivery is low at ${pct(m.delivery)} — clean invalid contacts and re-engage bounced numbers.`);
  }
  if (m.delivery >= 0.9 && m.openRate < 0.2) {
    issues.push(`Open rate is weak at ${pct(m.openRate)} — strengthen the hook / first line and sender name.`);
  }
  if (m.openRate >= 0.2 && m.clickRate < 0.05) {
    issues.push(`Click rate is low at ${pct(m.clickRate)} — add a single clear CTA and a shorter link.`);
  }
  if (m.clickRate >= 0.05 && m.conversionRate < 0.1) {
    issues.push(`Conversion (click→reply) is ${pct(m.conversionRate)} — qualify leads better and personalize the offer.`);
  }
  if (m.roi <= 0) {
    issues.push(`ROI is ${m.roi.toFixed(2)} — reduce send cost or improve targeting before scaling spend.`);
  }

  if (issues.length === 0) {
    return `Campaign is performing well (delivery ${pct(m.delivery)}, open ${pct(m.openRate)}, click ${pct(m.clickRate)}, reply ${pct(m.replyRate)}, ROI ${m.roi.toFixed(2)}). Scale spend and replicate this segment.`;
  }

  return `Recommendations: ${issues.join(' ')}`;
}

/**
 * Return a list of concrete, rule-based improvement suggestions for a campaign.
 */
export async function suggestImprovements(
  businessId: string,
  campaignId: string
): Promise<string[]> {
  const analysis = await analyzeCampaign(businessId, campaignId);
  const suggestions: string[] = [];

  if (analysis.delivery < 0.9) {
    suggestions.push('Validate and remove invalid / unreachable contacts to lift delivery above 90%.');
  }
  if (analysis.openRate < 0.2) {
    suggestions.push('Rewrite the opening line and use the business sender name to improve open rate.');
  }
  if (analysis.clickRate < 0.05) {
    suggestions.push('Use one explicit call-to-action and a short, trackable link to raise clicks.');
  }
  if (analysis.replyRate < 0.02) {
    suggestions.push('Add a question or personalized offer to spark replies and two-way conversation.');
  }
  if (analysis.conversionRate < 0.1) {
    suggestions.push('Tighten audience targeting and follow up with a segmented drip to convert more clicks.');
  }
  if (analysis.roi <= 0) {
    suggestions.push('Lower per-message cost (schedule off-peak, batch sends) or raise offer value to turn ROI positive.');
  }

  if (suggestions.length === 0) {
    suggestions.push('Keep the current segment and creative — performance is healthy. Test a small variant to find upside.');
  }

  return suggestions;
}
