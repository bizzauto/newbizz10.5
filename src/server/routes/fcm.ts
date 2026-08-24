import { Router, Response } from 'express';
import prisma from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { AuthRequest } from '../middleware/auth.js';
import { FcmService } from '../services/fcm.service.js';

const router = Router();

// Service-account JSON upload (Firebase console > Project settings > Service accounts)
router.post('/config', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, clientEmail, privateKey } = req.body || {};
    if (!projectId || !clientEmail || !privateKey) {
      return res.status(400).json({
        success: false,
        error: 'projectId, clientEmail, privateKey required',
      });
    }
    await FcmService.saveConfig(req.user!.businessId!, {
      projectId,
      clientEmail,
      privateKey: String(privateKey).replace(/\\n/g, '\n'),
    });
    return res.json({ success: true, message: 'FCM configured' });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/status', authenticate, async (req: AuthRequest, res: Response) => {
  const ok = await FcmService.isConfigured(req.user!.businessId);
  return res.json({ success: true, data: { configured: ok } });
});

// Test send to current user's devices
router.post('/test', authenticate, async (req: AuthRequest, res: Response) => {
  const r = await FcmService.sendToUser(
    req.user!.id,
    'BizzAuto Test 🔔',
    'FCM push working!',
    { url: '/dashboard' }
  );
  return res.json({ success: true, data: r });
});

export default router;
