import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as n8n from '../services/n8n.service.js';
import { emitEvent } from '../events/eventBus.js';

const router = Router();
router.use(authenticate);

router.get('/status', async (req: Request, res: Response) => {
  try {
    const baseUrl = (req.query.baseUrl as string) || undefined;
    const apiKey = (req.query.apiKey as string) || undefined;
    const workflows = await n8n.listWorkflows(baseUrl, apiKey);
    res.json({ configured: true, workflows });
  } catch (err: any) {
    res.status(200).json({ configured: n8n.isN8nConfigured(), error: err.message });
  }
});

router.get('/workflows', async (req: Request, res: Response) => {
  try {
    const baseUrl = (req.query.baseUrl as string) || undefined;
    const apiKey = (req.query.apiKey as string) || undefined;
    res.json(await n8n.listWorkflows(baseUrl, apiKey));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { workflowId, data, baseUrl, apiKey } = req.body || {};
    if (!workflowId) return res.status(400).json({ error: 'workflowId required' });
    const result = await n8n.executeWorkflow(workflowId, data || {}, baseUrl, apiKey);
    await emitEvent('workflow.triggered', { workflowId, by: (req as any).user?.id }, {
      businessId: (req as any).businessId,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const { path, method, body, baseUrl } = req.body || {};
    if (!path) return res.status(400).json({ error: 'path required' });
    const result = await n8n.triggerWebhook(path, method || 'POST', body, baseUrl);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
