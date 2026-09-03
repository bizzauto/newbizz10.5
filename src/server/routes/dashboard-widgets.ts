import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/dashboard-widgets — all real-data widgets in one call
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const businessId = req.user.businessId;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 86400_000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      leadsToday,
      leadsWeek,
      leadsTotal,
      messagesToday,
      messagesWeek,
      messagesSent,
      messagesDelivered,
      messagesRead,
      appointmentsToday,
      appointmentsWeek,
      invoicesPending,
      invoicesTotalDue,
      ordersToday,
      revenueMonth,
      topSources,
      dailyLeads,
      recentActivity,
      activeFlows,
      catalogCount,
      teamCount,
    ] = await Promise.allSettled([
      prisma.contact.count({ where: { businessId, createdAt: { gte: todayStart } } }),
      prisma.contact.count({ where: { businessId, createdAt: { gte: weekAgo } } }),
      prisma.contact.count({ where: { businessId } }),
      prisma.message.count({ where: { businessId, createdAt: { gte: todayStart }, direction: 'outbound' } }),
      prisma.message.count({ where: { businessId, createdAt: { gte: weekAgo }, direction: 'outbound' } }),
      prisma.message.count({ where: { businessId, direction: 'outbound', status: 'sent' } }),
      prisma.message.count({ where: { businessId, direction: 'outbound', status: 'delivered' } }),
      prisma.message.count({ where: { businessId, direction: 'outbound', status: 'read' } }),
      prisma.appointment.count({ where: { businessId, startTime: { gte: todayStart }, status: { notIn: ['cancelled'] } } }),
      prisma.appointment.count({ where: { businessId, startTime: { gte: weekAgo }, status: { notIn: ['cancelled'] } } }),
      prisma.document.count({ where: { businessId, type: 'invoice', status: { in: ['draft', 'sent'] } } }),
      prisma.document.aggregate({ where: { businessId, type: 'invoice', status: { in: ['draft', 'sent'] } }, _sum: { amount: true } }),
      prisma.order.count({ where: { businessId, createdAt: { gte: todayStart } } }),
      prisma.order.aggregate({ where: { businessId, createdAt: { gte: monthStart }, status: { notIn: ['cancelled'] } }, _sum: { total: true } }),
      prisma.contact.groupBy({ by: ['source'], where: { businessId }, _count: true, orderBy: { _count: { source: 'desc' } }, take: 6 }),
      prisma.$queryRaw`SELECT DATE("createdAt") as date, COUNT(*) as count FROM "Contact" WHERE "businessId" = ${businessId} AND "createdAt" >= ${weekAgo} GROUP BY DATE("createdAt") ORDER BY date`,
      prisma.activity.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' }, take: 8, select: { type: true, title: true, createdAt: true, contact: { select: { name: true } } } }),
      prisma.whatsAppFlow.count({ where: { businessId, isActive: true } }),
      prisma.whatsAppCatalog.count({ where: { businessId } }),
      prisma.user.count({ where: { businessId, isActive: true } }),
    ]);

    const val = (r: any, fallback: any = 0) => r.status === 'fulfilled' ? (r.value?._sum ? Object.values(r.value._sum)[0] ?? fallback : r.value) : fallback;

    res.json({
      success: true,
      data: {
        leads: {
          today: val(leadsToday),
          week: val(leadsWeek),
          total: val(leadsTotal),
          daily: val(dailyLeads, []),
          bySource: val(topSources, []).map((s: any) => ({ name: s.source || 'unknown', value: s._count })),
        },
        whatsapp: {
          sentToday: val(messagesToday),
          sentWeek: val(messagesWeek),
          delivered: val(messagesDelivered),
          read: val(messagesRead),
          deliveryRate: (val(messagesSent) > 0) ? Math.round((val(messagesDelivered) / val(messagesSent)) * 1000) / 10 : 0,
        },
        appointments: {
          today: val(appointmentsToday),
          week: val(appointmentsWeek),
        },
        invoices: {
          pending: val(invoicesPending),
          totalDue: val(invoicesTotalDue),
        },
        orders: {
          today: val(ordersToday),
          revenueMonth: val(revenueMonth),
        },
        business: {
          activeFlows: val(activeFlows),
          catalogItems: val(catalogCount),
          teamMembers: val(teamCount),
        },
        recentActivity: val(recentActivity, []),
      },
    });
  } catch (error: any) {
    console.error('Dashboard widgets error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
