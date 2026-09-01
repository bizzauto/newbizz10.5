import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  addKey,
  listKeys,
  updateKey,
  deleteKey,
  validateKeyInput,
  listProviders,
  hasActiveUserKeys,
  completeWithUserKeys,
  ByokKeyError,
} from '../services/byok-ai.service.js';

const router = Router();

/**
 * BYOK AI key management.
 * Mounted at /api/ai/keys (inherits /api/ai rate limiter).
 * All routes require authentication; users can only see/modify their OWN keys.
 * Full keys are NEVER returned — masked (••••last4) only.
 */

// GET /api/ai/keys/providers — supported providers + key hints (for UI)
router.get('/providers', authenticate, (_req: Request, res: Response) => {
  res.json({ success: true, data: listProviders() });
});

// GET /api/ai/keys — list user's keys (masked)
router.get('/', authenticate, async (req: any, res: Response) => {
  try {
    const keys = await listKeys(req.user.businessId);
    res.json({ success: true, data: { keys, hasAny: keys.length > 0 } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to list AI keys' });
  }
});

// POST /api/ai/keys — add a key
router.post('/', authenticate, async (req: any, res: Response) => {
  try {
    const { provider, key, label, baseUrl, defaultModel } = req.body || {};
    const validation = validateKeyInput({ provider, key, baseUrl, defaultModel });
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    // Limit keys per business (prevents abuse)
    const existing = await listKeys(req.user.businessId);
    if (existing.length >= 10) {
      return res.status(400).json({ success: false, error: 'Maximum 10 AI keys allowed. Remove one to add another.' });
    }

    const created = await addKey(req.user.businessId, {
      provider,
      key,
      label,
      baseUrl,
      defaultModel,
    });
    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to add AI key' });
  }
});

// PATCH /api/ai/keys/:id — update label/active/priority/model
router.patch('/:id', authenticate, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { label, isActive, priority, defaultModel, baseUrl } = req.body || {};
    const updated = await updateKey(req.user.businessId, id, {
      label,
      isActive,
      priority: priority !== undefined ? Math.max(-1, Math.min(999, Number(priority))) : undefined,
      defaultModel,
      baseUrl,
    });
    res.json({ success: true, data: updated });
  } catch (error: any) {
    if (error.message === 'Key not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Failed to update AI key' });
  }
});

// DELETE /api/ai/keys/:id
router.delete('/:id', authenticate, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    await deleteKey(req.user.businessId, id);
    res.json({ success: true, data: { deleted: true } });
  } catch (error: any) {
    if (error.message === 'Key not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Failed to delete AI key' });
  }
});

// POST /api/ai/keys/:id/test — live round-trip test with a tiny prompt
router.post('/:id/test', authenticate, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const keys = await listKeys(req.user.businessId);
    const target = keys.find((k: any) => k.id === id);
    if (!target) return res.status(404).json({ success: false, error: 'Key not found' });

    const { result, errors } = await completeWithUserKeys(
      req.user.businessId,
      [{ role: 'user', content: 'Reply with exactly: OK' }],
      { maxTokens: 10 }
    );

    if (result && result.keyId === id) {
      return res.json({ success: true, data: { tested: true, provider: result.provider, model: result.model, latencyMs: result.latencyMs } });
    }
    if (result) {
      // Another (higher priority) key answered — the tested key itself may be fine but wasn't reached.
      return res.json({
        success: false,
        data: { tested: false, note: `A different key (${result.keyLabel}) answered first. Deactivate it to test this one.` },
      });
    }
    const mine = errors.find((e) => e.includes(target.label)) || errors[0] || 'Unknown error';
    return res.status(502).json({ success: false, error: mine });
  } catch (error: any) {
    if (error instanceof ByokKeyError) {
      return res.status(502).json({ success: false, error: `${error.kind}: ${error.message}` });
    }
    res.status(500).json({ success: false, error: 'Key test failed' });
  }
});

// GET /api/ai/keys/status — quick flag for other UI parts
router.get('/status', authenticate, async (req: any, res: Response) => {
  try {
    const hasKeys = await hasActiveUserKeys(req.user.businessId);
    res.json({ success: true, data: { hasActiveKeys: hasKeys } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to check key status' });
  }
});

export default router;
