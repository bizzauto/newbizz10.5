import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth.js';
import {
  listFlags,
  setGlobalFlag,
  setOverride,
  FlagScope,
} from '../services/featureFlag.service.js';

const router = Router();

/**
 * GET /api/admin/feature-flags
 * List all global flags and scoped overrides (plus plan defaults).
 */
router.get(
  '/',
  authenticate,
  requireRole('SUPER_ADMIN', 'OWNER', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const businessId = req.user?.businessId;
      const result = await listFlags(businessId);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('List feature flags error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * POST /api/admin/feature-flags
 * Upsert a global feature flag.
 * Body: { key: string, enabled: boolean }
 */
router.post(
  '/',
  authenticate,
  requireRole('SUPER_ADMIN', 'OWNER', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { key, enabled } = req.body as { key?: string; enabled?: boolean };
      if (!key || typeof enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'key (string) and enabled (boolean) are required',
        });
      }

      const flag = await setGlobalFlag(key, enabled);
      res.json({ success: true, data: flag });
    } catch (error: any) {
      console.error('Set global flag error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * PATCH /api/admin/feature-flags/:key/override
 * Upsert a scoped override (GLOBAL | PLAN | TENANT | USER).
 * Body: { scope: FlagScope, plan?, tenantId?, userId?, enabled: boolean }
 */
router.patch(
  '/:key/override',
  authenticate,
  requireRole('SUPER_ADMIN', 'OWNER', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { key } = req.params;
      const { scope, plan, tenantId, userId, enabled } = req.body as {
        scope?: FlagScope;
        plan?: string;
        tenantId?: string;
        userId?: string;
        enabled?: boolean;
      };

      if (!scope || typeof enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'scope (GLOBAL|PLAN|TENANT|USER) and enabled (boolean) are required',
        });
      }

      const override = await setOverride({
        key,
        scope,
        plan,
        tenantId,
        userId,
        enabled,
      });

      res.json({ success: true, data: override });
    } catch (error: any) {
      console.error('Set override error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

export const featureFlagsRouter = router;
export default router;
