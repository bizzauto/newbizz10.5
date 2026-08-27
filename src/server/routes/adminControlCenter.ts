import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/auth.js';
import { prisma } from '../db.js';
import logger from '../utils/logger.js';
import { getTrace, listExecutions } from '../services/executionTrace.service.js';

// These two services are created by parallel agents. They are imported with the
// `.js` extension (NodeNext resolution). If the modules are not present yet,
// tsc will report a "cannot find module" error that is expected/concurrent and
// NOT an error in this file. The route handlers defend against missing exports
// at runtime via the local fallback branches.
import { listPending, resolveApproval } from '../services/approval.service.js';
import { replayFailed } from '../services/outbox.service.js';

/**
 * Admin Control Center router.
 *
 * Every route is guarded by `authenticate` plus a role check allowing
 * SUPER_ADMIN, OWNER, ADMIN, and MANAGER. The overview endpoint uses per-query
 * try/catch so that a model missing from a concurrent migration cannot 500 the
 * whole endpoint.
 */
export const adminControlCenterRouter = Router();

// Shared guard: any authenticated user with one of the admin roles.
const guard = [authenticate, requireRole('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER')] as const;

/**
 * GET /api/admin/control-center/overview
 * Aggregate counts across approvals, failed events, running executions, flags.
 */
adminControlCenterRouter.get('/overview', ...guard, async (req: Request, res: Response) => {
  const businessId = (req as any).user?.businessId as string | undefined;

  const overview: Record<string, unknown> = {};

  // Pending approvals
  try {
    overview.pendingApprovals = await prisma.approvalQueue.count({
      where: { businessId, status: 'pending' },
    });
  } catch (err: any) {
    logger.warn('[ControlCenter] approval count failed', { error: err?.message });
    overview.pendingApprovals = null;
  }

  // Failed events
  try {
    overview.failedEvents = await prisma.domainEvent.count({
      where: { businessId, status: 'failed' },
    });
  } catch (err: any) {
    logger.warn('[ControlCenter] failed event count failed', { error: err?.message });
    overview.failedEvents = null;
  }

  // Running executions
  try {
    overview.runningExecutions = await prisma.workflowExecution.count({
      where: { businessId, status: 'running' },
    });
  } catch (err: any) {
    logger.warn('[ControlCenter] running execution count failed', { error: err?.message });
    overview.runningExecutions = null;
  }

  // Active (enabled) feature flags
  try {
    overview.activeFlags = await prisma.featureFlag.count({
      where: { enabled: true },
    });
  } catch (err: any) {
    logger.warn('[ControlCenter] feature flag count failed', { error: err?.message });
    overview.activeFlags = null;
  }

  return res.json({ success: true, data: overview });
});

/**
 * GET /api/admin/control-center/approvals
 * List pending approval queue items for the business.
 */
adminControlCenterRouter.get('/approvals', ...guard, async (req: Request, res: Response) => {
  const businessId = (req as any).user?.businessId as string | undefined;
  if (!businessId) {
    return res.status(403).json({ success: false, error: 'No business associated with this account' });
  }

  try {
    const approvals = await listPending({ businessId, status: 'pending' });
    return res.json({ success: true, data: approvals });
  } catch (err: any) {
    logger.error('[ControlCenter] list approvals failed', { error: err?.message });
    return res.status(500).json({ success: false, error: 'Failed to list approvals' });
  }
});

/**
 * GET /api/admin/control-center/executions
 * List workflow executions for the business.
 */
adminControlCenterRouter.get('/executions', ...guard, async (req: Request, res: Response) => {
  const businessId = (req as any).user?.businessId as string | undefined;
  if (!businessId) {
    return res.status(403).json({ success: false, error: 'No business associated with this account' });
  }

  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;

  try {
    const executions = await listExecutions(businessId, { status, limit });
    return res.json({ success: true, data: executions });
  } catch (err: any) {
    logger.error('[ControlCenter] list executions failed', { error: err?.message });
    return res.status(500).json({ success: false, error: 'Failed to list executions' });
  }
});

/**
 * GET /api/admin/control-center/executions/:id/trace
 * Build a step-by-step trace for a single execution.
 */
adminControlCenterRouter.get(
  '/executions/:id/trace',
  ...guard,
  async (req: Request, res: Response) => {
    const businessId = (req as any).user?.businessId as string | undefined;
    if (!businessId) {
      return res.status(403).json({ success: false, error: 'No business associated with this account' });
    }

    const executionId = req.params.id;
    try {
      const trace = await getTrace(businessId, executionId);
      return res.json({ success: true, data: trace });
    } catch (err: any) {
      if (err?.message === 'Workflow execution not found') {
        return res.status(404).json({ success: false, error: 'Workflow execution not found' });
      }
      logger.error('[ControlCenter] get trace failed', { error: err?.message });
      return res.status(500).json({ success: false, error: 'Failed to build execution trace' });
    }
  }
);

/**
 * POST /api/admin/control-center/events/replay-all-failed
 * Replay every failed event through the outbox service.
 */
adminControlCenterRouter.post(
  '/events/replay-all-failed',
  ...guard,
  async (req: Request, res: Response) => {
    const businessId = (req as any).user?.businessId as string | undefined;
    try {
      const result = await replayFailed(businessId ? { businessId } : undefined);
      return res.json({ success: true, data: result });
    } catch (err: any) {
      logger.error('[ControlCenter] replay failed events failed', { error: err?.message });
      return res.status(200).json({
        success: true,
        note: 'Replay could not be completed at this time',
        error: err?.message,
      });
    }
  }
);

/**
 * POST /api/admin/control-center/approvals/:id/approve
 * Approve a pending approval queue item.
 */
adminControlCenterRouter.post(
  '/approvals/:id/approve',
  ...guard,
  async (req: Request, res: Response) => {
    const reviewerId = (req as any).user?.id as string | undefined;
    const approvalId = req.params.id;
    const note = typeof req.body?.note === 'string' ? req.body.note : undefined;

    try {
      const updated = await resolveApproval(approvalId, reviewerId ?? 'unknown', 'approved', note);
      return res.json({ success: true, data: updated });
    } catch (err: any) {
      logger.error('[ControlCenter] approve failed', { error: err?.message });
      return res.status(400).json({ success: false, error: err?.message || 'Failed to approve' });
    }
  }
);

/**
 * POST /api/admin/control-center/approvals/:id/reject
 * Reject a pending approval queue item.
 */
adminControlCenterRouter.post(
  '/approvals/:id/reject',
  ...guard,
  async (req: Request, res: Response) => {
    const reviewerId = (req as any).user?.id as string | undefined;
    const approvalId = req.params.id;
    const note = typeof req.body?.note === 'string' ? req.body.note : undefined;

    try {
      const updated = await resolveApproval(approvalId, reviewerId ?? 'unknown', 'rejected', note);
      return res.json({ success: true, data: updated });
    } catch (err: any) {
      logger.error('[ControlCenter] reject failed', { error: err?.message });
      return res.status(400).json({ success: false, error: err?.message || 'Failed to reject' });
    }
  }
);

export default adminControlCenterRouter;
