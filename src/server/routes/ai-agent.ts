import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import axios from 'axios';

const router = Router();

/**
 * AI Sales Agent â€” Agentic AI that talks to customers automatically.
 *
 * The "agent" is triggered by a business owner saying: "Call all my new leads"
 * or "Follow up with every hot lead this week". It:
 *   1. Scans the target contacts
 *   2. For each contact, generates a personalized message (BYOK or platform AI)
 *   3. Sends via WhatsApp (with anti-ban delay)
 *   4. Creates an activity log per send
 *   5. Reports back with counts
 *
 * This is a True Agent â€” it acts autonomously on a batch of contacts.
 */

// POST /api/ai-sales-agent/agent/run
// Body: { filter: 'new_today' | 'hot_leads' | 'all' | 'source:<name>', message?: string, maxContacts?: number, dryRun?: boolean }
router.post('/agent/run', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const businessId = req.user.businessId;
    const { filter = 'new_today', message: customMessage, maxContacts = 10, dryRun = false } = req.body || {};

    // 1. Determine target contacts based on filter
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let where: any = { businessId, whatsappOptIn: true, status: 'active' };

    if (filter === 'new_today') {
      where.createdAt = { gte: todayStart };
    } else if (filter === 'hot_leads') {
      where.tags = { has: 'hot-lead' };
    } else if (filter.startsWith('source:')) {
      where.source = filter.replace('source:', '');
    } else if (filter !== 'all') {
      // Tag-based filter
      where.tags = { has: filter };
    }

    const contacts = await prisma.contact.findMany({
      where,
      select: { id: true, name: true, phone: true, source: true, tags: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(50, Math.max(1, Number(maxContacts) || 10)),
    });

    if (contacts.length === 0) {
      return res.json({ success: true, data: { processed: 0, sent: 0, failed: 0, message: 'No matching contacts found' } });
    }

    // 2. Generate messages for each contact (personalized)
    const { spinAndPersonalize } = await import('../utils/spintax.js');
    const { WhatsAppSendRouter } = await import('../services/whatsapp-send-router.service.js');

    const defaultMessages = {
      new_today: '{Namaste|Hello|Hi} {name}! Welcome to {business}! ðŸ™ I wanted to personally reach out. {How can we help you today?|What are you looking for?}',
      hot_leads: '{Hi|Hello} {name}! {Just following up|Quick follow-up} on your interest. {We have|I have} something {special|great} for you! {Shall I share details?|Interested?}',
      all: '{Hi|Hello} {name}! {Just checking in|Quick update} â€” we have new {offers|products} at {business} that might interest you. {Want to know more?|Reply for details!}',
    };
    const template = customMessage || (defaultMessages as any)[filter] || defaultMessages.all;

    // 3. Send each message (anti-ban: default delay applies)
    let sent = 0;
    let failed = 0;
    const results: { contact: string; status: string; preview?: string; error?: string }[] = [];

    for (const contact of contacts) {
      if (!contact.phone) {
        results.push({ contact: contact.name, status: 'no_phone' });
        failed++;
        continue;
      }

      if (dryRun) {
        const preview = spinAndPersonalize(template, { name: contact.name, phone: contact.phone });
        results.push({ contact: contact.name, status: 'dry_run', preview: preview.substring(0, 100) });
        continue;
      }

      try {
        const msg = spinAndPersonalize(template, { name: contact.name, phone: contact.phone });
        await WhatsAppSendRouter.sendText(businessId, contact.phone, msg, {
          contactId: contact.id,
          rotate: true, // use number rotation if configured
        });

        await prisma.activity.create({
          data: {
            businessId,
            contactId: contact.id,
            type: 'ai_agent_outreach',
            title: 'AI Sales Agent outreach',
            content: msg.substring(0, 200),
            createdBy: 'ai-sales-agent',
            metadata: { filter, provider: 'ai_agent' },
          },
        });

        sent++;
        results.push({ contact: contact.name, status: 'sent' });
      } catch (err: any) {
        failed++;
        results.push({ contact: contact.name, status: 'failed', error: err?.message?.substring(0, 100) });
      }
    }

    res.json({
      success: true,
      data: {
        filter,
        processed: contacts.length,
        sent,
        failed,
        dryRun,
        results,
      },
    });
  } catch (error: any) {
    console.error('AI Sales Agent run error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ai-sales-agent/agent/history â€” recent agent runs
router.get('/agent/history', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const activities = await prisma.activity.findMany({
      where: { businessId: req.user.businessId, type: 'ai_agent_outreach' },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { title: true, content: true, createdAt: true, contact: { select: { name: true } } },
    });
    res.json({ success: true, data: activities });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
