import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import {
  listConversations,
  getConversation,
  getConversationSummary,
} from '../services/unifiedInbox.service.js';

const unifiedInboxRouter = Router();

/**
 * GET /api/inbox/conversations
 * List all conversations for the authenticated business, optionally filtered
 * by channel / assignedUserId / status (passed as query params).
 */
unifiedInboxRouter.get('/conversations', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) {
      return res.status(403).json({ success: false, error: 'No business associated with this account' });
    }

    const filter: { channel?: string; assignedUserId?: string; status?: string } = {};
    if (typeof req.query.channel === 'string') filter.channel = req.query.channel;
    if (typeof req.query.assignedUserId === 'string') filter.assignedUserId = req.query.assignedUserId;
    if (typeof req.query.status === 'string') filter.status = req.query.status;

    const conversations = await listConversations(businessId, filter);
    res.json({ success: true, data: conversations });
  } catch (error: any) {
    console.error('List conversations error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/inbox/conversations/:contactId
 * Full message thread + contact / lead / leadScore context for one contact.
 */
unifiedInboxRouter.get(
  '/conversations/:contactId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) {
        return res.status(403).json({ success: false, error: 'No business associated with this account' });
      }
      const { contactId } = req.params;
      const detail = await getConversation(businessId, contactId);
      res.json({ success: true, data: detail });
    } catch (error: any) {
      console.error('Get conversation error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/inbox/conversations/:contactId/summary
 * Structural summary (counts, channels, first/last seen). No AI call.
 */
unifiedInboxRouter.get(
  '/conversations/:contactId/summary',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) {
        return res.status(403).json({ success: false, error: 'No business associated with this account' });
      }
      const { contactId } = req.params;
      const summary = await getConversationSummary(businessId, contactId);
      res.json({ success: true, data: summary });
    } catch (error: any) {
      console.error('Get conversation summary error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

export { unifiedInboxRouter };
