import { Router, Request, Response } from 'express';
import { verifyMetaSignature, ingestLeadgenChange } from '../services/meta-leads.service.js';
import logger from '../utils/logger.js';

/**
 * Meta Lead Ads webhook (Facebook/Instagram lead forms).
 * Public endpoint — secured by Meta signature + verify token.
 * Configure in Meta App dashboard -> Webhooks -> Page: subscribe to `leadgen`.
 */
const router = Router();

router.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && expected && token === expected) {
    return res.status(200).send(String(challenge || ''));
  }
  return res.sendStatus(403);
});

router.post('/', async (req: any, res: Response) => {
  try {
    // Signature check: mandatory when META_APP_SECRET is configured.
    if (process.env.META_APP_SECRET && !verifyMetaSignature(req)) {
      logger.warn('[MetaLeads] Invalid webhook signature — rejecting');
      return res.sendStatus(401);
    }

    const body = req.body || {};
    if (body.object !== 'page') {
      return res.sendStatus(200); // not our object — ack and ignore
    }

    const entries: any[] = body.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        if (change.field === 'leadgen') {
          try {
            await ingestLeadgenChange(change);
          } catch (err: any) {
            // Retryable provider errors: return 500 so Meta retries delivery.
            logger.error(`[MetaLeads] Ingest failed (will let Meta retry): ${err?.message}`);
            return res.sendStatus(500);
          }
        }
      }
    }

    return res.sendStatus(200);
  } catch (err: any) {
    logger.error(`[MetaLeads] Webhook error: ${err?.message}`);
    return res.sendStatus(200); // never leak errors; avoid retry storms on bugs
  }
});

export default router;
