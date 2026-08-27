import { prisma } from '../db.js';
import { emitEvent } from '../events/eventBus.js';
import logger from '../utils/logger.js';

export type ApprovalLevel = 'AUTO' | 'APPROVAL' | 'HUMAN';

export const DEFAULT_EXPIRY_MINUTES = 60 * 24 * 7; // 7 days

interface RequestApprovalOpts {
  businessId: string;
  level?: ApprovalLevel;
  action: string;
  resourceType?: string;
  resourceId?: string;
  requestedBy?: string;
  payload?: any;
  reason?: string;
  expiresInMinutes?: number;
}

/**
 * Submit an action for approval.
 *
 * Safe (AUTO) actions are recorded as immediately approved and never block
 * the caller. Risky actions (APPROVAL / HUMAN) create a pending queue row
 * and emit `approval.requested` so reviewers can act on it.
 */
export async function requestApproval(
  opts: RequestApprovalOpts
): Promise<{ id?: string; status: 'approved' | 'pending'; autoApproved: boolean }> {
  const level: ApprovalLevel = opts.level ?? 'AUTO';

  // AUTO (or omitted) resolves to an immediate, recorded approval.
  if (level === 'AUTO') {
    const row = await prisma.approvalQueue.create({
      data: {
        businessId: opts.businessId,
        level: 'AUTO',
        action: opts.action,
        resourceType: opts.resourceType ?? null,
        resourceId: opts.resourceId ?? null,
        requestedBy: opts.requestedBy ?? null,
        status: 'approved',
        payload: (opts.payload ?? {}) as any,
        reason: opts.reason ?? null,
        reviewedBy: opts.requestedBy ?? 'system',
        reviewedAt: new Date(),
        expiresAt: null,
      },
    });

    return { id: row.id, status: 'approved', autoApproved: true };
  }

  // APPROVAL / HUMAN → pending + notify reviewers.
  const expiresInMinutes = opts.expiresInMinutes ?? DEFAULT_EXPIRY_MINUTES;
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  const row = await prisma.approvalQueue.create({
    data: {
      businessId: opts.businessId,
      level,
      action: opts.action,
      resourceType: opts.resourceType ?? null,
      resourceId: opts.resourceId ?? null,
      requestedBy: opts.requestedBy ?? null,
      status: 'pending',
      payload: (opts.payload ?? {}) as any,
      reason: opts.reason ?? null,
      expiresAt,
    },
  });

  await emitEvent(
    'approval.requested',
    {
      id: row.id,
      businessId: opts.businessId,
      level,
      action: opts.action,
      resourceType: opts.resourceType ?? null,
      resourceId: opts.resourceId ?? null,
      requestedBy: opts.requestedBy ?? null,
      reason: opts.reason ?? null,
      expiresAt,
    },
    { businessId: opts.businessId, actorId: opts.requestedBy }
  ).catch((err: any) => {
    logger.error('[Approval] failed to emit approval.requested', { error: err?.message });
  });

  return { id: row.id, status: 'pending', autoApproved: false };
}

/**
 * List pending (or filtered) approvals for a business.
 */
export async function listPending(opts: {
  businessId: string;
  action?: string;
  status?: string;
  limit?: number;
}) {
  const where: any = { businessId: opts.businessId };
  if (opts.action) where.action = opts.action;
  if (opts.status) where.status = opts.status;

  const limit = opts.limit && opts.limit > 0 ? opts.limit : 100;

  return prisma.approvalQueue.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Fetch a single approval queue entry by id.
 */
export async function getApproval(id: string) {
  return prisma.approvalQueue.findUnique({
    where: { id },
  });
}

/**
 * Resolve a pending approval (approve or reject).
 * Updates the row, stamps the reviewer + timestamp, and emits `approval.resolved`.
 */
export async function resolveApproval(
  id: string,
  reviewedBy: string,
  decision: 'approved' | 'rejected',
  note?: string
) {
  const existing = await prisma.approvalQueue.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('Approval not found');
  }

  if (existing.status !== 'pending') {
    throw new Error(`Approval is already ${existing.status}`);
  }

  const updated = await prisma.approvalQueue.update({
    where: { id },
    data: {
      status: decision,
      reviewedBy,
      reviewedAt: new Date(),
      reason: note ? `${existing.reason ?? ''}\n[${decision}] ${note}`.trim() : existing.reason,
    },
  });

  await emitEvent(
    'approval.resolved',
    {
      id,
      businessId: updated.businessId,
      level: updated.level,
      action: updated.action,
      resourceType: updated.resourceType,
      resourceId: updated.resourceId,
      requestedBy: updated.requestedBy,
      decision,
      reviewedBy,
      note: note ?? null,
    },
    { businessId: updated.businessId, actorId: reviewedBy }
  ).catch((err: any) => {
    logger.error('[Approval] failed to emit approval.resolved', { error: err?.message });
  });

  return updated;
}

/**
 * Expire overdue pending approvals.
 * Set status 'expired' where expiresAt < now and status 'pending'.
 * Intended to be called from a cron/worker.
 */
export async function expireOverdue(): Promise<number> {
  const now = new Date();
  const result = await prisma.approvalQueue.updateMany({
    where: {
      status: 'pending',
      expiresAt: { lt: now },
    },
    data: {
      status: 'expired',
      reviewedAt: now,
    },
  });

  if (result.count > 0) {
    logger.info('[Approval] expired overdue requests', { count: result.count });
  }

  return result.count;
}
