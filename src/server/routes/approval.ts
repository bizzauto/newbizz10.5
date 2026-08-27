import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth.js';
import {
  listPending,
  getApproval,
  resolveApproval,
} from '../services/approval.service.js';

export const approvalRouter = Router();

/**
 * GET /api/approvals
 * List pending (or filtered) approvals for the caller's business.
 */
approvalRouter.get(
  '/',
  authenticate,
  requireRole('OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { action, status, limit } = req.query as {
        action?: string;
        status?: string;
        limit?: string;
      };

      const items = await listPending({
        businessId: req.user.businessId,
        action,
        status,
        limit: limit ? parseInt(limit, 10) : undefined,
      });

      res.json({ success: true, data: items });
    } catch (error: any) {
      console.error('List approvals error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/approvals/:id
 * Fetch a single approval queue entry.
 */
approvalRouter.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const item = await getApproval(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Approval not found' });
    }
    res.json({ success: true, data: item });
  } catch (error: any) {
    console.error('Get approval error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/approvals/:id/approve
 * Approve a pending request.
 */
approvalRouter.post('/:id/approve', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const updated = await resolveApproval(req.params.id, req.user.id, 'approved', req.body?.note);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Approve error:', error);
    const status = error.message === 'Approval not found' ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/approvals/:id/reject
 * Reject a pending request.
 */
approvalRouter.post('/:id/reject', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const updated = await resolveApproval(req.params.id, req.user.id, 'rejected', req.body?.note);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Reject error:', error);
    const status = error.message === 'Approval not found' ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});
