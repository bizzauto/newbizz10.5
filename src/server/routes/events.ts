import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth.js';
import { emitEvent } from '../events/eventBus.js';
import {
  listEvents,
  getEvent,
  replayEvent,
  replayFailed,
} from '../services/outbox.service.js';

/**
 * Secure automation gateway for the Event Outbox.
 *
 * Mounted at /api/automation. All routes require authentication; the ingest
 * route additionally restricts to privileged roles (SUPER_ADMIN / OWNER /
 * ADMIN / MANAGER) — or a valid x-n8n-api-key, which `authenticate()` already
 * resolves to an ADMIN-scoped service account.
 */
const router = Router();

const REQUIRED_ROLES = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'];

/**
 * POST /api/automation/events
 * Ingest an external event into the outbox (persists + publishes to stream).
 */
router.post('/events', authenticate, requireRole(...REQUIRED_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const {
      event_type,
      businessId,
      resource_id,
      payload,
      request_id,
      idempotency_key,
    } = req.body || {};

    if (!event_type || typeof event_type !== 'string') {
      return res.status(400).json({ success: false, error: 'event_type is required' });
    }
    if (!businessId || typeof businessId !== 'string') {
      return res.status(400).json({ success: false, error: 'businessId is required' });
    }
    if (payload === undefined || payload === null) {
      return res.status(400).json({ success: false, error: 'payload is required' });
    }

    // Enrich the payload with routing metadata without disturbing the original.
    const enriched = {
      ...(typeof payload === 'object' && !Array.isArray(payload) ? payload : { value: payload }),
      ...(resource_id !== undefined ? { resource_id } : {}),
      ...(request_id !== undefined ? { request_id } : {}),
    };

    await emitEvent(event_type, enriched, {
      businessId,
      idempotencyKey: idempotency_key || request_id,
    });

    // Return the most recent persisted record as the created id.
    const created = await prisma.domainEvent.findFirst({
      where: { eventType: event_type, businessId },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, ok: true, id: created?.id ?? null });
  } catch (error: any) {
    console.error('[Events] ingest error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Internal error' });
  }
});

/**
 * GET /api/automation/events
 * List outbox events with optional filters.
 */
router.get('/events', authenticate, requireRole(...REQUIRED_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const { businessId, eventType, status, limit } = req.query as Record<string, string>;
    const events = await listEvents({
      businessId,
      eventType,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return res.json({ success: true, data: events, count: events.length });
  } catch (error: any) {
    console.error('[Events] list error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Internal error' });
  }
});

/**
 * GET /api/automation/events/:id
 * Fetch a single outbox event.
 */
router.get('/events/:id', authenticate, requireRole(...REQUIRED_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const event = await getEvent(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    return res.json({ success: true, data: event });
  } catch (error: any) {
    console.error('[Events] get error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Internal error' });
  }
});

/**
 * POST /api/automation/events/:id/replay
 * Re-publish a single event to the stream.
 */
router.post('/events/:id/replay', authenticate, requireRole(...REQUIRED_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const result = await replayEvent(req.params.id);
    if (!result.ok) {
      return res.status(result.error === 'Event not found' ? 404 : 502).json({
        success: false,
        ok: false,
        error: result.error,
      });
    }
    return res.json({ success: true, ok: true, id: req.params.id });
  } catch (error: any) {
    console.error('[Events] replay error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Internal error' });
  }
});

/**
 * POST /api/automation/executions/:id/retry
 * Compatibility alias. In this service an "execution" is an outbox event, so
 * the execution id IS the event id. Delegates to replayEvent.
 */
router.post('/executions/:id/retry', authenticate, requireRole(...REQUIRED_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const result = await replayEvent(req.params.id);
    if (!result.ok) {
      return res.status(result.error === 'Event not found' ? 404 : 502).json({
        success: false,
        ok: false,
        error: result.error,
      });
    }
    return res.json({ success: true, ok: true, id: req.params.id });
  } catch (error: any) {
    console.error('[Events] retry error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Internal error' });
  }
});

export const eventsRouter = router;
export default router;
