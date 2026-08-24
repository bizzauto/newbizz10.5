import { prisma } from '../../../db.js';

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
};
