import { prisma } from '../db.js';
import logger from '../utils/logger.js';
import { emitEvent } from '../events/eventBus.js';
import { pipelineSummary, salesRepPerformance } from './revenueIntelligence.service.js';
import { flagAtRisk } from './churnDetection.service.js';

const HOT_SCORE_THRESHOLD = 70;

/**
 * Build a daily business report by composing revenue intelligence, churn
 * signals and lead counts. Recommendations are generated from simple rules.
 */
export async function generateDailyReport(
  businessId: string
): Promise<{
  date: string;
  newLeads: number;
  hotLeads: number;
  unansweredLeads: number;
  dealsWon: number;
  dealsLost: number;
  revenue: number;
  pendingFollowUps: number;
  atRiskDeals: number;
  recommendations: string[];
}> {
  const date = new Date().toISOString().slice(0, 10);

  let newLeads = 0;
  let hotLeads = 0;
  let unansweredLeads = 0;
  let dealsWon = 0;
  let dealsLost = 0;
  let revenue = 0;
  let pendingFollowUps = 0;
  let atRiskDeals = 0;

  // Revenue intelligence
  try {
    const summary = await pipelineSummary(businessId, 1);
    newLeads = summary.newLeads;
    dealsWon = summary.wonLeads;
    dealsLost = summary.lostLeads;
    revenue = summary.revenue;
    pendingFollowUps = summary.stuckDeals;
  } catch (err) {
    logger.debug('[autopilot] pipelineSummary skipped', { error: String(err) });
  }

  // Hot + unanswered leads
  try {
    const leads = await prisma.lead.findMany({
      where: { businessId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      select: { score: true, status: true },
    });
    hotLeads = leads.filter((l) => l.score >= HOT_SCORE_THRESHOLD).length;
    // "unanswered" = new leads that were never contacted (status still new)
    unansweredLeads = leads.filter((l) => l.status.toLowerCase() === 'new').length;
  } catch (err) {
    logger.debug('[autopilot] lead scoring skipped', { error: String(err) });
  }

  // At-risk customers (churn)
  try {
    const atRisk = await flagAtRisk(businessId);
    atRiskDeals = atRisk.length;
  } catch (err) {
    logger.debug('[autopilot] churn flag skipped', { error: String(err) });
  }

  // Rule-generated recommendations
  const recommendations: string[] = [];
  if (unansweredLeads > 0) {
    recommendations.push(
      `Follow up on ${unansweredLeads} unanswered new lead(s) from today.`
    );
  }
  if (pendingFollowUps > 0) {
    recommendations.push(
      `${pendingFollowUps} deal(s) are stuck (no activity in 14+ days) — schedule a touchpoint.`
    );
  }
  if (hotLeads > 0) {
    recommendations.push(
      `${hotLeads} hot lead(s) scored high — prioritize these for conversion.`
    );
  }
  if (atRiskDeals > 0) {
    recommendations.push(
      `${atRiskDeals} customer(s) flagged at-risk for churn — launch a re-engagement sequence.`
    );
  }
  if (dealsLost > 0 && dealsWon === 0 && newLeads > 0) {
    recommendations.push(
      'No wins today despite new leads — review your qualification and follow-up cadence.'
    );
  }
  if (recommendations.length === 0) {
    recommendations.push('No urgent actions — pipeline looks healthy today.');
  }

  return {
    date,
    newLeads,
    hotLeads,
    unansweredLeads,
    dealsWon,
    dealsLost,
    revenue,
    pendingFollowUps,
    atRiskDeals,
    recommendations,
  };
}

/**
 * Generate the daily report and dispatch it. This emits a `daily.report.generated`
 * event and logs delivery attempts. Notification delivery is intentionally
 * best-effort and safe: we do not reach into external/whatsapp sending here —
 * the event stream (n8n) is the integration point.
 */
export async function dispatchDailyReport(
  businessId: string
): Promise<{ report: any; delivered: { channel: string; ok: boolean }[] }> {
  const report = await generateDailyReport(businessId);

  const delivered: { channel: string; ok: boolean }[] = [];

  // Primary dispatch: event bus (consumed by n8n / real-time).
  try {
    await emitEvent('daily.report.generated', { businessId, report }, { businessId });
    delivered.push({ channel: 'eventBus', ok: true });
  } catch (err) {
    logger.error('[autopilot] daily report event failed', { error: String(err) });
    delivered.push({ channel: 'eventBus', ok: false });
  }

  // Best-effort audit log line as a secondary delivery channel.
  try {
    logger.info('[autopilot] daily report dispatched', { businessId, date: report.date });
    delivered.push({ channel: 'log', ok: true });
  } catch {
    delivered.push({ channel: 'log', ok: false });
  }

  return { report, delivered };
}
