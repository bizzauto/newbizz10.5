import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * Marketing message templates for Evolution / unofficial WhatsApp flows.
 * Backed by the MessageTemplate model's `content` field ("simple text content
 * for marketing messages") — separate from the Meta Cloud API template routes
 * in whatsapp.ts which need waAccessToken.
 */

interface BuiltinTemplate {
  name: string;
  category: 'MARKETING' | 'UTILITY';
  content: string;
}

/** Ready-made marketing pack seeded on first load so the feature is useful immediately. */
const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    name: 'Welcome Offer',
    category: 'MARKETING',
    content:
      'Hi {{name}}! 👋\n\nWelcome to our family! As a thank-you, here is {{discount}} OFF on your first order.\n\n🎁 Use code: WELCOME\n\nReply YES to claim!',
  },
  {
    name: 'Festival Sale',
    category: 'MARKETING',
    content:
      '🎉 {{name}}, our biggest Festival Sale is LIVE!\n\n{{offer}}\n\n⏰ Valid till {{valid_till}} only.\n\nShop now before stocks run out!',
  },
  {
    name: 'Cart Recovery',
    category: 'MARKETING',
    content:
      'Hi {{name}}, you left "{{product}}" in your cart 🛒\n\nComplete your order in the next 24 hours and get free shipping!\n\nNeed help picking? Just reply here.',
  },
  {
    name: 'New Arrival Launch',
    category: 'MARKETING',
    content:
      '✨ Just landed, {{name}}!\n\n{{product}} is now available at {{price}}.\n\nLimited stock — first come, first served. Want photos or details? Reply INFO.',
  },
  {
    name: 'Payment Reminder',
    category: 'UTILITY',
    content:
      'Hi {{name}}, a gentle reminder 🙏\n\nYour payment of ₹{{amount}} is due on {{due_date}}.\n\nPay easily via UPI or card — reply PAY for the link.',
  },
  {
    name: 'Appointment Reminder',
    category: 'UTILITY',
    content:
      'Hi {{name}}! 📅\n\nReminder: your appointment is on {{date}} at {{time}}.\n\nReply RESCHEDULE to change or CONFIRM to keep it. See you soon!',
  },
  {
    name: 'Win-back Offer',
    category: 'MARKETING',
    content:
      '{{name}}, we miss you! 💙\n\nIt has been a while — here is {{discount}} OFF to welcome you back.\n\nValid for 72 hours only. Reply COMEBACK!',
  },
  {
    name: 'Referral Reward',
    category: 'MARKETING',
    content:
      'Thank you for being with us, {{name}}! 🙌\n\nShare your code {{referral_code}} with friends — you both get a reward when they order.\n\nHappy sharing!',
  },
  {
    name: 'Flash Deal',
    category: 'MARKETING',
    content:
      '⚡ FLASH DEAL, {{name}}!\n\n{{deal}}\n\nOnly for the next {{hours}} hours. Reply BUY to grab it now!',
  },
  {
    name: 'Feedback Request',
    category: 'UTILITY',
    content:
      'Hi {{name}}, how was your experience? ⭐\n\nIt takes 30 seconds: {{link}}\n\nYour feedback helps us improve — thank you!',
  },
];

function extractVariables(content: string): string[] {
  const vars = new Set<string>();
  const re = /\{\{\s*([\w.]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) vars.add(m[1]);
  return Array.from(vars);
}

/** GET /api/message-templates — list; auto-seeds the builtin pack the first time. */
router.get('/', authenticate, async (req: any, res: Response) => {
  try {
    const businessId = req.user.businessId;

    const existing = await prisma.messageTemplate.count({ where: { businessId } });
    if (existing === 0) {
      await prisma.messageTemplate.createMany({
        data: BUILTIN_TEMPLATES.map(t => ({
          businessId,
          name: t.name,
          category: t.category,
          content: t.content,
          language: 'en',
          status: 'APPROVED', // local templates are usable immediately (not pending Meta review)
          variables: extractVariables(t.content),
          components: [],
        })),
        skipDuplicates: true,
      });
    }

    const templates = await prisma.messageTemplate.findMany({
      where: { businessId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true, name: true, category: true, content: true, language: true,
        variables: true, status: true, isActive: true, usageCount: true,
        lastUsedAt: true, createdAt: true,
      },
    });

    res.json({ success: true, data: templates });
  } catch (error: any) {
    console.error('[MessageTemplates] list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/** POST /api/message-templates — create a custom template. */
router.post('/', authenticate, async (req: any, res: Response) => {
  try {
    const businessId = req.user.businessId;
    const { name, content, category } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'Template name is required' });
    }
    if (!content || !String(content).trim()) {
      return res.status(400).json({ success: false, error: 'Template content is required' });
    }

    const template = await prisma.messageTemplate.create({
      data: {
        businessId,
        name: String(name).trim().slice(0, 100),
        content: String(content),
        category: ['MARKETING', 'UTILITY'].includes(category) ? category : 'MARKETING',
        language: 'en',
        status: 'APPROVED',
        variables: extractVariables(String(content)),
        components: [],
      },
    });

    res.json({ success: true, data: template });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(400).json({ success: false, error: 'A template with this name already exists' });
    }
    console.error('[MessageTemplates] create error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/** PATCH /api/message-templates/:id/use — record a template usage. */
router.patch('/:id/use', authenticate, async (req: any, res: Response) => {
  try {
    const template = await prisma.messageTemplate.updateMany({
      where: { id: req.params.id, businessId: req.user.businessId },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    });
    if (template.count === 0) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** DELETE /api/message-templates/:id — delete a template. */
router.delete('/:id', authenticate, async (req: any, res: Response) => {
  try {
    const deleted = await prisma.messageTemplate.deleteMany({
      where: { id: req.params.id, businessId: req.user.businessId },
    });
    if (deleted.count === 0) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
