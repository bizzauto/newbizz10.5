import { Router, Request, Response } from 'express';
import { emitEvent } from '../events/eventBus.js';

const router = Router();

// Generic inbound webhook ingress. External systems (WhatsApp, forms, ad
// platforms, payment gateways, n8n) POST here; each call becomes a DomainEvent
// that n8n / workers can consume. Per-source signature validation can be added.
router.post('/:source', async (req: Request, res: Response) => {
  try {
    const source = req.params.source;
    const body = req.body || {};
    const businessId =
      body.businessId || body.business_id || (req.query.businessId as string) || null;
    const eventType = body.event || `${source}.webhook`;
    await emitEvent(eventType, { source, data: body, headers: req.headers }, { businessId });
    res.status(202).json({ accepted: true, eventType });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
