import { prisma } from '../../../db.js';
import { isSafeWebhookUrl } from '../../webhook-retry.service.js';

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
  workflowId?: string;
  triggerData?: Record<string, any>;
  contact?: any;
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
};

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
