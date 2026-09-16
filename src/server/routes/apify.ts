/**
 * Apify routes — per-business BYOK web scrapers & automation.
 *
 * Connect: POST /api/integrations { provider: 'apify', apiKey } (generic flow).
 * Everything below reads the business's own encrypted token.
 */
import { Router, Response } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';
import { ApifyService, APIFY_CURATED_ACTORS } from '../services/apify.service.js';

const router = Router();
router.use(authenticate);

/** GET /api/apify/status — connected account + spend snapshot */
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const [account, usage] = await Promise.all([
      ApifyService.getAccount(req.user.businessId),
      ApifyService.getUsage(req.user.businessId),
    ]);
    res.json({ success: true, data: { connected: true, account, usage } });
  } catch (error: any) {
    const notConfigured = /not connected/i.test(error?.message || '');
    res.status(notConfigured ? 400 : 500).json({ success: false, error: error.message });
  }
});

/** GET /api/apify/actors — curated actors + required input contract */
router.get('/actors', async (_req: AuthRequest, res: Response) => {
  res.json({ success: true, data: APIFY_CURATED_ACTORS });
});

/** POST /api/apify/runs — start an actor run (OWNER, ADMIN) */
router.post('/runs', requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { actorId, input, memoryMbs, timeoutSecs, build } = req.body || {};
    if (!actorId) {
      return res.status(400).json({ success: false, error: 'actorId is required (e.g. apify/google-maps-scraper)' });
    }
    const run = await ApifyService.startRun(req.user.businessId, { actorId, input, memoryMbs, timeoutSecs, build });
    res.status(201).json({ success: true, data: run });
  } catch (error: any) {
    const bad = /Invalid actor|must be a JSON object/i.test(error?.message || '');
    res.status(bad ? 400 : 500).json({ success: false, error: error.message });
  }
});

/** GET /api/apify/runs/:runId — poll run status (records final cost once) */
router.get('/runs/:runId', async (req: AuthRequest, res: Response) => {
  try {
    const run = await ApifyService.getRun(req.user.businessId, req.params.runId);
    res.json({ success: true, data: run });
  } catch (error: any) {
    const bad = /Invalid run id/i.test(error?.message || '');
    res.status(bad ? 400 : 500).json({ success: false, error: error.message });
  }
});

/** GET /api/apify/runs/:runId/items — dataset rows (?limit&offset) */
router.get('/runs/:runId/items', async (req: AuthRequest, res: Response) => {
  try {
    const items = await ApifyService.getRunItems(req.user.businessId, {
      runId: req.params.runId,
      datasetId: typeof req.query.datasetId === 'string' ? req.query.datasetId : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    res.json({ success: true, data: items });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** POST /api/apify/runs/:runId/import — dataset rows → CRM contacts (dedupe) */
router.post('/runs/:runId/import', requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await ApifyService.importRunItems(req.user.businessId, {
      runId: req.params.runId,
      limit: req.body?.limit,
      tag: typeof req.body?.tag === 'string' ? req.body.tag.slice(0, 40) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** POST /api/apify/import — import provided items directly (pasted results) */
router.post('/import', requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { items, tag, limit } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'items array is required' });
    }
    const result = await ApifyService.importRunItems(req.user.businessId, {
      items: items.filter((i) => i && typeof i === 'object') as Record<string, unknown>[],
      limit,
      tag: typeof tag === 'string' ? tag.slice(0, 40) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** GET /api/apify/usage — spend + imports overview */
router.get('/usage', async (req: AuthRequest, res: Response) => {
  try {
    const usage = await ApifyService.getUsage(req.user.businessId);
    res.json({ success: true, data: usage });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
