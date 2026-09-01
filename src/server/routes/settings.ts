import { Router } from 'express';
import { prisma } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { cacheResponse } from '../middleware/cache.js';

const router = Router();

// ==================== PUBLIC BRANDING (white-label apply) ====================
// GET /api/settings/branding?domain=... â€” NO AUTH.
// The app shell (AppWrapper) calls this BEFORE login so the login screen,
// favicon and CSS variables reflect the reseller's brand. Falls back to
// BizzAuto defaults when no active white-label config exists.
router.get('/branding', cacheResponse(120), async (req: any, res: any) => {
  try {
    const domain = (req.query.domain as string) || req.hostname || '';
    let settings = null;
    if (domain) {
      settings = await prisma.whiteLabel.findFirst({
        where: { customDomain: domain, isActive: true },
      });
    }
    if (!settings) {
      // No domain match â†’ default tenant branding (single-brand installs)
      settings = await prisma.whiteLabel.findFirst({ where: { isActive: true } });
    }

    res.json({
      success: true,
      data: {
        brandName: settings?.brandName || 'BizzAuto AI',
        logoUrl: settings?.logoUrl || '/logo.svg',
        faviconUrl: settings?.faviconUrl || '/favicon.svg',
        primaryColor: settings?.primaryColor || '#1B6EF3',
        customCss: settings?.customCss || '',
        customDomain: settings?.customDomain || null,
        isActive: !!settings?.isActive,
      },
    });
  } catch (error: any) {
    // Fail-open with BizzAuto defaults â€” a branding lookup failure must never
    // blank the app.
    res.json({
      success: true,
      data: {
        brandName: 'BizzAuto AI',
        logoUrl: '/logo.svg',
        faviconUrl: '/favicon.svg',
        primaryColor: '#1B6EF3',
        customCss: '',
        customDomain: null,
        isActive: false,
      },
    });
  }
});

const routerAuth = Router();
routerAuth.use(authenticate);

// ==================== WHITE LABEL ====================

// Get white-label settings
routerAuth.get('/', cacheResponse(60), async (req: any, res: any) => {
  try {
    let settings = await prisma.whiteLabel.findUnique({
      where: { businessId: req.user.businessId },
    });

    if (!settings) {
      settings = await prisma.whiteLabel.create({
        data: { businessId: req.user.businessId },
      });
    }

    res.json({ success: true, data: settings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update white-label settings
routerAuth.put('/', requireRole('OWNER', 'ADMIN'), async (req: any, res: any) => {
  try {
    const { brandName, logoUrl, faviconUrl, primaryColor, customCss, customDomain, isActive } = req.body;
    const settings = await prisma.whiteLabel.upsert({
      where: { businessId: req.user.businessId },
      update: { brandName, logoUrl, faviconUrl, primaryColor, customCss, customDomain, isActive },
      create: { businessId: req.user.businessId, brandName, logoUrl, faviconUrl, primaryColor, customCss, customDomain, isActive },
    });
    res.json({ success: true, data: settings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== THEME PREFERENCES ====================

routerAuth.get('/theme', cacheResponse(60), async (req: any, res: any) => {
  try {
    let prefs = await prisma.themePreference.findUnique({
      where: { userId: req.user.id },
    });

    if (!prefs) {
      prefs = await prisma.themePreference.create({
        data: { userId: req.user.id },
      });
    }

    res.json({ success: true, data: prefs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

routerAuth.put('/theme', async (req: any, res: any) => {
  try {
    const { theme, sidebarCollapsed, accentColor } = req.body;
    const prefs = await prisma.themePreference.upsert({
      where: { userId: req.user.id },
      update: { theme, sidebarCollapsed, accentColor },
      create: { userId: req.user.id, theme, sidebarCollapsed, accentColor },
    });
    res.json({ success: true, data: prefs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== APPOINTMENTS ====================

// Get appointments
routerAuth.get('/appointments', cacheResponse(60), async (req: any, res: any) => {
  try {
    const { status, startDate, endDate } = req.query;
    const where: any = { businessId: req.user.businessId };
    if (status) where.status = status;
    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) where.startTime.gte = new Date(startDate);
      if (endDate) where.startTime.lte = new Date(endDate);
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        contact: { select: { id: true, name: true, phone: true, email: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    res.json({ success: true, data: appointments });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create appointment
routerAuth.post('/appointments', requireRole('OWNER', 'ADMIN'), async (req: any, res: any) => {
  try {
    const { title, description, service, startTime, endTime, contactId, location, isOnline, meetingLink, meetingUrl, status } = req.body;
    const appointment = await prisma.appointment.create({
      data: { businessId: req.user.businessId, createdBy: req.user.id, title, description, service, startTime, endTime, contactId, location, isOnline, meetingLink, meetingUrl, status },
      include: { contact: true },
    });
    res.status(201).json({ success: true, data: appointment });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update appointment
routerAuth.put('/appointments/:id', requireRole('OWNER', 'ADMIN'), async (req: any, res: any) => {
  try {
    const appointment = await prisma.appointment.findFirst({
      where: { id: req.params.id, businessId: req.user.businessId },
    });
    if (!appointment) return res.status(404).json({ success: false, error: 'Not found' });

    const { title, description, service, startTime, endTime, status, location, isOnline, meetingLink, meetingUrl } = req.body;
    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { title, description, service, startTime, endTime, status, location, isOnline, meetingLink, meetingUrl },
    });
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete appointment
routerAuth.delete('/appointments/:id', requireRole('OWNER', 'ADMIN'), async (req: any, res: any) => {
  try {
    await prisma.appointment.delete({
      where: { id: req.params.id, businessId: req.user.businessId },
    });
    res.json({ success: true, message: 'Deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default routerAuth;
export const brandingRouter = router;
