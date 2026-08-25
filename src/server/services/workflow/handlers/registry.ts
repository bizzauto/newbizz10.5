import { prisma } from '../../../db.js';
import { isSafeWebhookUrl } from '../../webhook-retry.service.js';
import { interpolateTemplate } from '../interpolate.js';

/**
 * Node-handler registry — Master Prompt §44 refactor.
 *
 * Each workflow node-type moves out of the giant `executeNode` switch into a
 * small focused handler here. Behavior must stay byte-identical to the
 * original inline implementation (migration map: WORKFLOW_REFACTOR.md).
 */

export interface WorkflowNodeContext {
  contactId?: string;
  businessId?: string;
  phone?: string;
  email?: string;
  workflowId?: string;
  executionId?: string;
  nodeType?: string;
  triggerData?: Record<string, any>;
  contact?: any;
  previousOutput?: Record<string, any>;
  data: Record<string, any>;
}

export type NodeHandler = (ctx: WorkflowNodeContext) => Promise<Record<string, any>>;

function parseTags(raw: any): string[] {
  return Array.isArray(raw) ? raw : String(raw || '').split(',').map((t) => t.trim()).filter(Boolean);
}

export const nodeHandlers: Record<string, NodeHandler> = {
  update_contact: async ({ contactId, data }) => {
    if (!contactId) return { updated: false, error: 'No contact ID' };
    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.email) updateData.email = data.email;
    if (data.status) updateData.status = data.status;
    if (data.dealValue) updateData.dealValue = parseFloat(data.dealValue);
    if (data.notes) updateData.notes = data.notes;

    await prisma.contact.update({ where: { id: contactId }, data: updateData });
    return { updated: true, fields: updateData };
  },

  add_tag: async ({ contactId, data }) => {
    if (!contactId) return { tagged: false, error: 'No contact ID' };
    const tags = parseTags(data.tags);
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    const existingTags = (contact?.tags as string[]) || [];
    const newTags = [...new Set([...existingTags, ...tags])];
    await prisma.contact.update({ where: { id: contactId }, data: { tags: newTags } });
    return { tagged: true, tags: newTags };
  },

  remove_tag: async ({ contactId, data }) => {
    if (!contactId) return { untagged: false, error: 'No contact ID' };
    const removeTags = parseTags(data.tags);
    const c = await prisma.contact.findUnique({ where: { id: contactId } });
    const currentTags = (c?.tags as string[]) || [];
    const filteredTags = currentTags.filter((t) => !removeTags.includes(t));
    await prisma.contact.update({ where: { id: contactId }, data: { tags: filteredTags } });
    return { untagged: true, removed: removeTags, remaining: filteredTags };
  },

  send_sms: async ({ phone, data }) => {
    // SMS requires a configured provider (Twilio, etc.)
    console.warn('[Workflow] send_sms node triggered but no SMS provider configured');
    return { sent: false, error: 'SMS provider not configured', to: phone, message: data.message, channel: 'sms' };
  },

  webhook: async ({ businessId, triggerData, contact, data }) => {
    const { default: axios } = await import('axios');
    const url = data.url;
    if (!url) return { called: false, error: 'No webhook URL' };

    // SSRF protection: block private/internal/metadata IPs
    const urlCheck = isSafeWebhookUrl(url);
    if (!urlCheck.safe) {
      return { called: false, error: `Blocked webhook URL: ${urlCheck.reason}` };
    }

    const payload = { businessId, triggerData, contact, nodeData: data };

    try {
      const response = await axios.post(url, payload, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      });
      return { called: true, url, status: response.status };
    } catch (err: any) {
      return { called: false, error: err.message };
    }
  },

  delay: async ({ data }) => delayHandler(data),
  wait: async ({ data }) => delayHandler(data),

  add_activity: async ({ contactId, businessId, workflowId, data }) => {
    if (!contactId) return { added: false, error: 'No contact ID' };
    await prisma.activity.create({
      data: {
        businessId: businessId as string,
        contactId,
        type: data.activityType || 'note',
        title: data.title || 'Activity added by workflow',
        content: data.content || '',
        metadata: { workflowId },
        createdBy: 'system',
      },
    });
    return { added: true };
  },

  trigger: async () => ({ triggered: true, timestamp: new Date().toISOString() }),

  send_whatsapp: async (ctx) => whatsappHandler(ctx),
  send_message: async (ctx) => whatsappHandler(ctx),

  send_email: async ({ businessId, contactId, workflowId, email, data, contact, triggerData }) => {
    const { default: nodemailer } = await import('nodemailer');
    const subject = interpolateTemplate(data.subject || 'Message from BizzAuto', { contact, trigger: triggerData });
    const body = interpolateTemplate(data.message || data.body || '', { contact, trigger: triggerData });
    const toEmail = data.to || email;

    if (!toEmail) return { sent: false, error: 'No email address' };

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: toEmail,
        subject,
        html: body,
      });

      await prisma.message.create({
        data: {
          businessId: businessId as string,
          contactId: contactId || undefined,
          direction: 'outbound',
          type: 'email',
          content: body,
          status: 'sent',
          metadata: { workflowId, to: toEmail, subject },
        },
      });

      return { sent: true, to: toEmail, subject };
    } catch (err: any) {
      return { sent: false, error: err.message };
    }
  },

  ai_reply: async (ctx) => aiResponseHandler(ctx),
  ai_response: async (ctx) => aiResponseHandler(ctx),

  ai_score_lead: async ({ contactId, businessId }) => {
    // Verbatim port from original inline logic (rules-based scoring)
    try {
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { dealValue: true, tags: true, lastActivity: true, stage: true },
      }) as any;

      let overallScore = 50, engagementScore = 50, recencyScore = 50, intentScore = 50, fitScore = 50;

      if (contact) {
        engagementScore = Math.min(100, Math.floor((contact.dealValue || 0) / 10000));
        const tags = (contact.tags || []).map((t: string) => t.toLowerCase());
        if (tags.includes('hot') || tags.includes('vip')) intentScore = 85;
        else if (tags.includes('warm')) intentScore = 70;
        else if (tags.includes('cold')) intentScore = 30;

        switch (contact.stage) {
          case 'Won': fitScore = 95; break;
          case 'Negotiation': fitScore = 85; break;
          case 'Proposal': fitScore = 75; break;
          case 'Qualified': fitScore = 65; break;
          case 'Contacted': fitScore = 55; break;
          default: fitScore = 45;
        }
        overallScore = Math.floor((engagementScore + recencyScore + intentScore + fitScore) / 4);
      }

      await prisma.leadScore.upsert({
        where: { businessId_contactId: { businessId: businessId as string, contactId: contactId as string } },
        update: { score: overallScore, engagementScore, recencyScore, intentScore, fitScore, lastScoredAt: new Date() },
        create: { businessId: businessId as string, contactId: contactId as string, score: overallScore, engagementScore, recencyScore, intentScore, fitScore, lastScoredAt: new Date() },
      });
      return { scored: true, score: overallScore, engagementScore, recencyScore, intentScore, fitScore };
    } catch (err: any) {
      console.warn('[Workflow] Lead score calculation failed:', err?.message);
      return { scored: false, error: err?.message };
    }
  },
};

/** AI reply/response — now routed through the AI Gateway (§9): fallback +
 *  provider health + usage/cost ledger come for free. Output shape unchanged. */
async function aiResponseHandler(ctx: WorkflowNodeContext): Promise<Record<string, any>> {
  try {
    const business = await prisma.business.findUnique({ where: { id: ctx.businessId } });
    const autopilot = await prisma.autopilotSettings.findFirst({ where: { businessId: ctx.businessId } });

    const tone = autopilot?.aiTone || 'professional';
    const language = autopilot?.aiLanguage || 'english';
    const systemPrompt = ctx.data.systemPrompt ||
      `You are a helpful ${tone} customer service agent for ${business?.name || 'the business'}. ` +
      `Reply in ${language}. Be concise and helpful. Do not use markdown. Keep messages under 300 characters for WhatsApp.`;

    const incomingMessage = ctx.triggerData?.message || ctx.data.message || 'Hello';
    const history = ctx.triggerData?.conversationHistory || [];

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.slice(-5).map((h: any) => ({ role: h.role || 'user' as const, content: h.content })),
      { role: 'user' as const, content: incomingMessage },
    ];

    const { aiComplete } = await import('../ai-gateway.service.js');
    const gw = await aiComplete('short_text', messages, { businessId: ctx.businessId, maxTokens: 500 });
    const response = gw.text;

    if (ctx.phone && response) {
      const sendResult = await nodeHandlers.send_whatsapp({ ...ctx, data: { message: response, to: ctx.phone } });
      return { generated: true, response, sent: (sendResult as any).sent, channel: 'ai_whatsapp', provider: gw.provider };
    }

    return { generated: true, response, sent: false, reason: 'no_phone', provider: gw.provider };
  } catch (err: any) {
    return { generated: false, error: err.message };
  }
}

async function whatsappHandler({
  nodeType, businessId, contactId, phone, workflowId, executionId, data, contact, triggerData, previousOutput,
}: import('./registry').WorkflowNodeContext): Promise<Record<string, any>> {
  const { default: axios } = await import('axios');
  const message = interpolateTemplate(data.message || data.template || 'Hello!', { contact, trigger: triggerData, previous: previousOutput });
  const to = data.to || phone;
  if (!to) return { sent: false, error: 'No phone number' };

  try {
    const integration = await prisma.integration.findFirst({
      where: { businessId: businessId as string, type: 'whatsapp_meta', isActive: true },
    });

    if (integration) {
      const config = integration.config as any;
      await axios.post(
        `https://graph.facebook.com/v18.0/${config.phoneNumberId}/messages`,
        { messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'text', text: { body: message } },
        { headers: { Authorization: `Bearer ${config.accessToken}` } }
      );

      await prisma.message.create({
        data: {
          businessId: businessId as string,
          contactId: contactId || undefined,
          direction: 'outbound', type: 'text', content: message, status: 'sent',
          metadata: { workflowId, executionId, nodeType },
        },
      });
      return { sent: true, to, message, channel: 'whatsapp_meta' };
    }

    const evo = await prisma.integration.findFirst({
      where: { businessId: businessId as string, type: 'evolution_api', isActive: true },
    });

    if (evo) {
      const config = evo.config as any;
      await axios.post(
        `${config.baseUrl}/message/sendText/${config.instanceName}`,
        { number: to.replace(/\D/g, ''), textMessage: { text: message } },
        { headers: { apikey: config.apiKey } }
      );

      await prisma.message.create({
        data: {
          businessId: businessId as string,
          contactId: contactId || undefined,
          direction: 'outbound', type: 'text', content: message, status: 'sent',
          metadata: { workflowId, executionId, nodeType },
        },
      });
      return { sent: true, to, message, channel: 'evolution' };
    }

    return { sent: false, error: 'No WhatsApp provider configured' };
  } catch (err: any) {
    console.error(`[Workflow] WhatsApp send failed:`, err.message);
    return { sent: false, error: err.message };
  }
}

async function delayHandler(data: Record<string, any>): Promise<Record<string, any>> {
  // Parse duration string (e.g., "30m", "1h", "2d") to milliseconds
  const durationStr = data.duration || '1h';
  let delayMs = 60 * 60 * 1000; // default 1h
  const match = durationStr.match(/^(\d+)(m|h|d)$/);
  if (match) {
    const val = parseInt(match[1]);
    if (match[2] === 'm') delayMs = val * 60 * 1000;
    else if (match[2] === 'h') delayMs = val * 60 * 60 * 1000;
    else if (match[2] === 'd') delayMs = val * 24 * 60 * 60 * 1000;
  }

  if (delayMs <= 30000) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { waited: true, duration: durationStr, actualMs: delayMs, scheduled: false };
  }

  console.warn(`[Workflow] Delay node "${durationStr}" (${delayMs}ms) — in-process wait too long, continuing immediately. Implement queue-based scheduling for production.`);
  return { waited: false, duration: durationStr, scheduled: false, warning: 'Long delays require queue-based scheduling' };
}
