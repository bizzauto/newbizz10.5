import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';
import { isN8nConfigured } from '../services/n8n.service.js';

const router = Router();

/**
 * GET /api/metrics
 * Read-only runtime + business metrics for monitoring dashboards.
 * OWNER/ADMIN only.
 */
router.get('/', authenticate, requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const businessId = req.user.businessId;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [events24h, eventsByType, leads24h, invoicesPaid24h, dealsOpen, appointmentsToday] = await Promise.all([
      prisma.domainEvent.count({ where: { businessId, createdAt: { gte: since24h } } }),
      prisma.domainEvent.groupBy({
        by: ['eventType'],
        where: { businessId, createdAt: { gte: since24h } },
        _count: { _all: true },
      }),
      prisma.contact.count({ where: { businessId, source: { not: null }, createdAt: { gte: since24h } } }),
      prisma.document.count({
        where: { businessId, type: 'invoice', status: 'paid', updatedAt: { gte: since24h } },
      }),
      prisma.contact.count({
        where: { businessId, OR: [{ dealStage: { not: null } }, { stage: { not: null } }] },
      }),
      prisma.appointment.count({
        where: {
          businessId,
          startTime: { gte: new Date(new Date().toDateString()), lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        uptimeSeconds: Math.floor(process.uptime()),
        n8nConfigured: isN8nConfigured(),
        events: {
          total24h: events24h,
          byType: eventsByType.map((e: any) => ({ type: e.eventType, count: e._count._all })),
        },
        crm: {
          leads24h,
          dealsOpen,
          invoicesPaid24h,
          appointmentsToday,
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Failed to load metrics' });
  }
});

export default router;
