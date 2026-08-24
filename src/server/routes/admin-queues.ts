import { Router, Request, Response } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';
import { queues } from '../workers/index.js';
import logger from '../utils/logger.js';

/**
 * Dead-Letter Queue management (SUPER_ADMIN).
 *
 * BullMQ keeps failed jobs in a per-queue "failed" zset (already retained
 * 7 days / 5000 jobs via removeOnFail). These endpoints give admins
 * visibility + recovery instead of silent loss:
 *   GET    /                     -> per-queue health counts
 *   GET    /:queue/failed        -> paginated failed-job listing
 *   POST   /:queue/failed/:jobId/retry -> retry one failed job
 *   POST   /:queue/failed/retry-all     -> bulk retry (cap 100)
 */

const router = Router();

const QUEUE_MAP: Record<string, any> = {
  whatsapp: () => queues?.whatsappMessages,
  emails: () => queues?.emails,
  'social-publish': () => queues?.socialPublish,
  'google-sheets-sync': () => queues?.googleSheetsSync,
  'lead-processing': () => queues?.leadProcessing,
  'campaign-scheduler': () => queues?.campaignScheduler,
  'gbp-auto-post': () => queues?.gbpAutoPost,
};

function getQueue(name: string) {
  return QUEUE_MAP[name]?.();
}

router.get('/', authenticate, requireRole('SUPER_ADMIN'), async (_req: AuthRequest, res: Response) => {
  try {
    const out: any = {};
    for (const [name, get] of Object.entries(QUEUE_MAP)) {
      const q = get();
      if (!q) { out[name] = { available: false }; continue; }
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        q.getWaitingCount(), q.getActiveCount(), q.getCompletedCount(),
        q.getFailedCount(), q.getDelayedCount(),
      ]);
      out[name] = { available: true, waiting, active, completed, failed, delayed };
    }
    res.json({ success: true, data: out });
  } catch (err: any) {
    logger.error(`[AdminQueues] overview failed: ${err?.message}`);
    res.status(500).json({ success: false, error: { code: 'QUEUE_OVERVIEW_FAILED', message: 'Could not read queue stats' } });
  }
});

router.get('/:queue/failed', authenticate, requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const q = getQueue(req.params.queue);
    if (!q) return res.status(404).json({ success: false, error: { code: 'QUEUE_NOT_FOUND', message: 'Unknown queue' } });
    const start = Math.max(0, parseInt(String(req.query.start || '0'), 10) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
    const jobs = await q.getFailed(start, start + limit - 1);
    res.json({
      success: true,
      data: jobs.map((j: any) => ({
        id: j.id, name: j.name, attempts: j.attemptsMade,
        failedReason: j.failedReason || j.stacktrace?.[0]?.slice(0, 200) || 'unknown',
        timestamp: j.timestamp, data: j.data,
      })),
      pagination: { start, limit },
    });
  } catch (err: any) {
    logger.error(`[AdminQueues] failed-list error: ${err?.message}`);
    res.status(500).json({ success: false, error: { code: 'QUEUE_LIST_FAILED', message: 'Could not list failed jobs' } });
  }
});

router.post('/:queue/failed/retry-all', authenticate, requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const q = getQueue(req.params.queue);
    if (!q) return res.status(404).json({ success: false, error: { code: 'QUEUE_NOT_FOUND', message: 'Unknown queue' } });
    const failed = await q.getFailed(0, 99); // cap bulk retry at 100
    let retried = 0;
    for (const job of failed) {
      try { await job.retry(); retried++; } catch { /* already active/completed */ }
    }
    logger.info(`[AdminQueues] ${req.params.queue}: bulk-retried ${retried}/${failed.length} by admin`);
    res.json({ success: true, data: { retried, total: failed.length } });
  } catch (err: any) {
    logger.error(`[AdminQueues] retry-all error: ${err?.message}`);
    res.status(500).json({ success: false, error: { code: 'RETRY_ALL_FAILED', message: 'Bulk retry failed' } });
  }
});

router.post('/:queue/failed/:jobId/retry', authenticate, requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const q = getQueue(req.params.queue);
    if (!q) return res.status(404).json({ success: false, error: { code: 'QUEUE_NOT_FOUND', message: 'Unknown queue' } });
    const job = await q.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } });
    await job.retry();
    res.json({ success: true, data: { id: job.id, retried: true } });
  } catch (err: any) {
    logger.error(`[AdminQueues] retry error: ${err?.message}`);
    res.status(500).json({ success: false, error: { code: 'RETRY_FAILED', message: 'Retry failed' } });
  }
});

// ─── System Control Center snapshot (Master Prompt §37) ───
router.get('/system', authenticate, requireRole('SUPER_ADMIN'), async (_req: AuthRequest, res: Response) => {
  try {
    const dayAgo = new Date(Date.now() - 24 * 3600_000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600_000);
    const [dbOk] = [await prisma.$queryRaw`SELECT 1`];
    let redisOk = true;
    try { await (Object.values(QUEUE_MAP)[0]?.() || { client: null })?.client?.ping(); } catch { redisOk = false; }
    const events24h = await prisma.domainEvent.count({ where: { createdAt: { gte: dayAgo } } }).catch(() => -1);
    const aiAgg = await prisma.aiUsageLog.groupBy({
      by: ['provider'], where: { createdAt: { gte: monthAgo } },
      _count: { _all: true }, _sum: { costUsd: true, tokensOut: true },
    }).catch(() => []);
    const { getProviderStatus } = await import('../services/ai-gateway.service.js');
    res.json({
      success: true,
      data: {
        db: { ok: Array.isArray(dbOk) }, redis: { ok: redisOk },
        automation: { domainEvents24h: events24h },
        ai: { providers: getProviderStatus(), usage30d: aiAgg.map((a: any) => ({ provider: a.provider, requests: a._count._all, tokensOut: a._sum.tokensOut || 0, costUsd: Number((a._sum.costUsd || 0).toFixed(4)) })) },
      },
    });
  } catch (err: any) {
    logger.error(`[AdminQueues] system snapshot failed: ${err?.message}`);
    res.status(500).json({ success: false, error: { code: 'SYSTEM_SNAPSHOT_FAILED', message: 'Snapshot failed' } });
  }
});

export default router;
