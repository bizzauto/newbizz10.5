/**
 * Marketing automation router.
 *
 * Exposes campaign analysis + suggestions, social publishing + status, and
 * review classification + handling under /api/marketing/*.
 *
 * Authentication is applied only where the spec requires it; the heavy
 * automation endpoints (publish / classify / handle) are intended to be
 * callable from trusted automation contexts (JWT or n8n service auth) but are
 * kept open per the task contract. Add `authenticate` to any route to lock it
 * down further.
 */

import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  analyzeCampaign,
  suggestImprovements,
} from '../services/campaignOptimizer.service.js';
import {
  publishPost,
  getPlatformStatus,
} from '../services/socialEngine.service.js';
import {
  classifyReview,
  handleReview,
} from '../services/reviewAutopilot.service.js';

export const marketingAutomationRouter = Router();

// GET /api/marketing/campaigns/:id/analysis
marketingAutomationRouter.get(
  '/campaigns/:id/analysis',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const businessId = (req as any).user?.businessId;
      if (!businessId) {
        return res.status(403).json({ success: false, error: 'No business associated with this account' });
      }
      const result = await analyzeCampaign(businessId, req.params.id);
      return res.json({ success: true, data: result });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'analysis failed' });
    }
  }
);

// GET /api/marketing/campaigns/:id/suggestions
marketingAutomationRouter.get(
  '/campaigns/:id/suggestions',
  async (req: Request, res: Response) => {
    try {
      const businessId = (req as any).user?.businessId || (req.query.businessId as string);
      if (!businessId) {
        return res.status(400).json({ success: false, error: 'businessId is required' });
      }
      const suggestions = await suggestImprovements(businessId, req.params.id);
      return res.json({ success: true, data: suggestions });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'suggestions failed' });
    }
  }
);

// POST /api/marketing/social/publish
marketingAutomationRouter.post(
  '/social/publish',
  async (req: Request, res: Response) => {
    try {
      const businessId = (req as any).user?.businessId || req.body?.businessId;
      if (!businessId) {
        return res.status(400).json({ success: false, error: 'businessId is required' });
      }
      const { platform, content, mediaUrl, scheduledAt } = req.body || {};
      if (!platform || !content) {
        return res.status(400).json({ success: false, error: 'platform and content are required' });
      }
      const result = await publishPost(businessId, { platform, content, mediaUrl, scheduledAt });
      return res.json({ success: result.ok, ...result });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'publish failed' });
    }
  }
);

// GET /api/marketing/social/status
marketingAutomationRouter.get(
  '/social/status',
  async (req: Request, res: Response) => {
    try {
      const businessId = (req as any).user?.businessId || (req.query.businessId as string);
      if (!businessId) {
        return res.status(400).json({ success: false, error: 'businessId is required' });
      }
      const status = await getPlatformStatus(businessId);
      return res.json({ success: true, data: status });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'status failed' });
    }
  }
);

// POST /api/marketing/reviews/classify
marketingAutomationRouter.post(
  '/reviews/classify',
  async (req: Request, res: Response) => {
    try {
      const { text } = req.body || {};
      if (typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ success: false, error: 'text is required' });
      }
      const result = await classifyReview(text);
      return res.json({ success: true, data: result });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'classify failed' });
    }
  }
);

// POST /api/marketing/reviews/:id/handle
marketingAutomationRouter.post(
  '/reviews/:id/handle',
  async (req: Request, res: Response) => {
    try {
      const businessId = (req as any).user?.businessId || req.body?.businessId;
      if (!businessId) {
        return res.status(400).json({ success: false, error: 'businessId is required' });
      }
      const text = typeof req.body?.text === 'string' ? req.body.text : '';
      const result = await handleReview(businessId, req.params.id, text);
      return res.json({ success: true, data: result });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'handle failed' });
    }
  }
);

export default marketingAutomationRouter;
