import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// Missed-call summary stats for the business
router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const businessId = req.user.businessId;
    const [totalCalls, missedCalls, missedToday, missedLast7] = await Promise.all([
      prisma.callLog.count({ where: { businessId } }),
      prisma.callLog.count({ where: { businessId, status: 'missed' } }),
      prisma.callLog.count({ where: { businessId, status: 'missed', createdAt: { gte: startOfToday() } } }),
      prisma.callLog.count({ where: { businessId, status: 'missed', createdAt: { gte: daysAgo(7) } } }),
    ]);
    res.json({
      success: true,
      data: {
        totalCalls,
        missedCalls,
        missedToday,
        missedLast7Days: missedLast7,
      },
    });
  } catch (error: any) {
    console.error('Missed call stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch missed call stats', details: error.message });
  }
});

// Recent missed-call activity for the business
router.get('/activity', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const businessId = req.user.businessId;
    const calls = await prisma.callLog.findMany({
      where: { businessId, status: 'missed' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { contact: { select: { id: true, name: true, phone: true } } },
    });
    res.json({ success: true, data: { activity: calls } });
  } catch (error: any) {
    console.error('Missed call activity error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch missed call activity', details: error.message });
  }
});

export default router;
