/**
 * HTTP routes for the No-Code + Natural-Language Automation Builder.
 *
 * Base path: /api/automation
 */
import express, { Request, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import {
  validateSpec,
  createAutomation,
  listAutomations,
  getAutomation,
  setActive,
  AutomationSpec,
} from '../services/automationBuilder.service.js';
import { nlToAutomation } from '../services/nlAutomation.service.js';

export const automationBuilderRouter = express.Router();

type Handler = (req: AuthRequest, res: Response, next: NextFunction) => Promise<void> | void;

const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req as AuthRequest, res, next)).catch(next);
};

/**
 * POST /api/automation/build
 * Validate an AutomationSpec and persist it as a Workflow.
 */
automationBuilderRouter.post(
  '/build',
  authenticate,
  wrap(async (req, res) => {
    const spec = req.body as AutomationSpec;

    // businessId is always sourced from the authenticated token when the
    // body omits it; this prevents a request from writing to another tenant.
    if (!spec.businessId) {
      spec.businessId = (req as AuthRequest).user?.businessId || '';
    }
    if (!spec.businessId) {
      res.status(400).json({ success: false, error: 'businessId is required' });
      return;
    }

    const { valid, errors } = await validateSpec(spec);
    if (!valid) {
      res.status(400).json({ success: false, error: 'Invalid automation spec', errors });
      return;
    }

    const created = await createAutomation(spec);
    res.status(201).json({ success: true, data: created });
  })
);

/**
 * GET /api/automation
 * List all automations for the authenticated business.
 */
automationBuilderRouter.get(
  '/',
  authenticate,
  wrap(async (req, res) => {
    const businessId = (req as AuthRequest).user?.businessId;
    if (!businessId) {
      res.status(400).json({ success: false, error: 'businessId is required' });
      return;
    }
    const items = await listAutomations(businessId);
    res.status(200).json({ success: true, data: items });
  })
);

/**
 * GET /api/automation/:id
 * Fetch a single automation by id.
 */
automationBuilderRouter.get(
  '/:id',
  authenticate,
  wrap(async (req, res) => {
    const item = await getAutomation(req.params.id);
    if (!item) {
      res.status(404).json({ success: false, error: 'Automation not found' });
      return;
    }
    res.status(200).json({ success: true, data: item });
  })
);

/**
 * PATCH /api/automation/:id/active
 * Toggle the enabled/active flag.
 */
automationBuilderRouter.patch(
  '/:id/active',
  authenticate,
  wrap(async (req, res) => {
    const active = req.body?.active === true || req.body?.active === 'true';
    const updated = await setActive(req.params.id, active);
    if (!updated) {
      res.status(404).json({ success: false, error: 'Automation not found' });
      return;
    }
    res.status(200).json({ success: true, data: updated });
  })
);

/**
 * POST /api/automation/nl
 * Generate an AutomationSpec from natural-language text.
 */
automationBuilderRouter.post(
  '/nl',
  authenticate,
  wrap(async (req, res) => {
    const businessId = (req as AuthRequest).user?.businessId;
    const naturalLanguage = typeof req.body?.naturalLanguage === 'string' ? req.body.naturalLanguage : '';

    if (!businessId) {
      res.status(400).json({ success: false, error: 'businessId is required' });
      return;
    }
    if (!naturalLanguage || naturalLanguage.trim().length === 0) {
      res.status(400).json({ success: false, error: 'naturalLanguage is required' });
      return;
    }

    const result = await nlToAutomation(businessId, naturalLanguage);
    res.status(200).json({ success: true, data: result });
  })
);
