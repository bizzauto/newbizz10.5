import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import logger from '../utils/logger.js';

/**
 * Mobile device push-token registry (FCM via @capacitor/push-notifications).
 * Sending options later: OneSignal (existing service) or FCM HTTP v1.
 */
const router = Router();

router.post('/register-device', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const { token, platform = 'android', appVersion, businessId } = req.body || {};
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!token || typeof token !== 'string' || token.length < 20) {
      return res.status(400).json({ success: false, error: 'Valid push token required' });
    }

    const saved = await prisma.deviceToken.upsert({
      where: { token },
      update: { userId: String(userId), businessId: businessId || null, platform, appVersion: appVersion || null, isActive: true },
      create: { token, userId: String(userId), businessId: businessId || null, platform, appVersion: appVersion || null },
    });

    logger.info(`[PushDevices] registered ${platform} token for user ${userId}`);
    res.json({ success: true, data: { id: saved.id } });
  } catch (err: any) {
    logger.error(`[PushDevices] register failed: ${err?.message}`);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

router.post('/unregister-device', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ success: false, error: 'token required' });
    await prisma.deviceToken.updateMany({ where: { token }, data: { isActive: false } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Unregister failed' });
  }
});

export default router;
