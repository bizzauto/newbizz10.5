/**
 * AI Tool Permissions service.
 *
 * Maps each agent role to the set of tools it is allowed to invoke, and
 * provides runtime access checks plus audit logging for tool usage.
 *
 * This module is intentionally dependency-light: it only depends on the
 * shared logger and event bus (best-effort) so it can be imported from any
 * agent/automation path without risking import cycles.
 */

import logger from '../utils/logger.js';
import { emitEvent } from '../events/eventBus.js';
import type { AgentRole, ToolDef, ToolName } from '../types/ai-tools.js';

/**
 * TOOL_REGISTRY defines the allowed tools per agent role.
 *
 * - MANAGER is a routing/super role that can reach every tool.
 * - Sensitive/destructive tools (send_whatsapp, publish_post, update_deal,
 *   etc.) are marked APPROVAL/HUMAN so they are gated before execution.
 */
export const TOOL_REGISTRY: Record<AgentRole, ToolDef[]> = {
  SALES: [
    { name: 'get_contact', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:get_contact', auditLog: true, description: 'Read a contact record' },
    { name: 'get_lead', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:get_lead', auditLog: true, description: 'Read a lead record' },
    { name: 'score_lead', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:score_lead', auditLog: true, description: 'Score a lead by fit' },
    { name: 'create_task', permission: 'APPROVAL', tenantScoped: true, rateLimitKey: 'tool:create_task', approvalRule: 'task.create', auditLog: true, description: 'Create a follow-up task' },
    { name: 'send_whatsapp', permission: 'HUMAN', tenantScoped: true, rateLimitKey: 'tool:send_whatsapp', approvalRule: 'outbound.message', auditLog: true, description: 'Send a WhatsApp message to a contact' },
    { name: 'update_deal', permission: 'APPROVAL', tenantScoped: true, rateLimitKey: 'tool:update_deal', approvalRule: 'deal.update', auditLog: true, description: 'Update a deal pipeline stage/amount' },
  ],
  SUPPORT: [
    { name: 'get_customer', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:get_customer', auditLog: true, description: 'Read a customer record' },
    { name: 'get_conversation', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:get_conversation', auditLog: true, description: 'Read a support conversation' },
    { name: 'create_ticket', permission: 'APPROVAL', tenantScoped: true, rateLimitKey: 'tool:create_ticket', approvalRule: 'ticket.create', auditLog: true, description: 'Create a support ticket' },
    { name: 'draft_reply', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:draft_reply', auditLog: true, description: 'Draft a customer support reply' },
  ],
  MARKETING: [
    { name: 'generate_content', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:generate_content', auditLog: true, description: 'Generate marketing copy' },
    { name: 'generate_image', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:generate_image', auditLog: true, description: 'Generate a marketing image' },
    { name: 'create_campaign', permission: 'APPROVAL', tenantScoped: true, rateLimitKey: 'tool:create_campaign', approvalRule: 'campaign.create', auditLog: true, description: 'Create a marketing campaign' },
    { name: 'publish_post', permission: 'HUMAN', tenantScoped: true, rateLimitKey: 'tool:publish_post', approvalRule: 'post.publish', auditLog: true, description: 'Publish a social media post' },
  ],
  REVIEW: [
    { name: 'draft_reply', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:review:draft_reply', auditLog: true, description: 'Draft a review response' },
    { name: 'get_customer', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:review:get_customer', auditLog: true, description: 'Read the customer for a review' },
  ],
  ANALYTICS: [
    { name: 'get_lead', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:analytics:get_lead', auditLog: true, description: 'Read lead data for analytics' },
    { name: 'get_contact', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:analytics:get_contact', auditLog: true, description: 'Read contact data for analytics' },
  ],
  CUSTOMER_SUCCESS: [
    { name: 'get_customer', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:cs:get_customer', auditLog: true, description: 'Read a customer for success management' },
    { name: 'create_task', permission: 'APPROVAL', tenantScoped: true, rateLimitKey: 'tool:cs:create_task', approvalRule: 'task.create', auditLog: true, description: 'Create a customer success task' },
  ],
  MANAGER: [
    { name: 'get_contact', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:mgr:get_contact', auditLog: true, description: 'Read a contact record' },
    { name: 'get_lead', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:mgr:get_lead', auditLog: true, description: 'Read a lead record' },
    { name: 'score_lead', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:mgr:score_lead', auditLog: true, description: 'Score a lead by fit' },
    { name: 'create_task', permission: 'APPROVAL', tenantScoped: true, rateLimitKey: 'tool:mgr:create_task', approvalRule: 'task.create', auditLog: true, description: 'Create a follow-up task' },
    { name: 'send_whatsapp', permission: 'HUMAN', tenantScoped: true, rateLimitKey: 'tool:mgr:send_whatsapp', approvalRule: 'outbound.message', auditLog: true, description: 'Send a WhatsApp message to a contact' },
    { name: 'update_deal', permission: 'APPROVAL', tenantScoped: true, rateLimitKey: 'tool:mgr:update_deal', approvalRule: 'deal.update', auditLog: true, description: 'Update a deal pipeline stage/amount' },
    { name: 'generate_content', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:mgr:generate_content', auditLog: true, description: 'Generate marketing copy' },
    { name: 'generate_image', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:mgr:generate_image', auditLog: true, description: 'Generate a marketing image' },
    { name: 'create_campaign', permission: 'APPROVAL', tenantScoped: true, rateLimitKey: 'tool:mgr:create_campaign', approvalRule: 'campaign.create', auditLog: true, description: 'Create a marketing campaign' },
    { name: 'publish_post', permission: 'HUMAN', tenantScoped: true, rateLimitKey: 'tool:mgr:publish_post', approvalRule: 'post.publish', auditLog: true, description: 'Publish a social media post' },
    { name: 'get_customer', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:mgr:get_customer', auditLog: true, description: 'Read a customer record' },
    { name: 'get_conversation', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:mgr:get_conversation', auditLog: true, description: 'Read a support conversation' },
    { name: 'create_ticket', permission: 'APPROVAL', tenantScoped: true, rateLimitKey: 'tool:mgr:create_ticket', approvalRule: 'ticket.create', auditLog: true, description: 'Create a support ticket' },
    { name: 'draft_reply', permission: 'AUTO', tenantScoped: true, rateLimitKey: 'tool:mgr:draft_reply', auditLog: true, description: 'Draft a customer support reply' },
  ],
};

/** Lookup helper: find a tool def in a role's registry. */
function findToolDef(role: AgentRole, tool: ToolName): ToolDef | undefined {
  return TOOL_REGISTRY[role]?.find((t) => t.name === tool);
}

export interface ToolAccessContext {
  businessId: string;
  userId: string;
}

export interface ToolAccessResult {
  allowed: boolean;
  reason?: string;
  requiresApproval: boolean;
}

/**
 * Check whether an agent role is permitted to invoke a given tool.
 *
 * Rules:
 *  - Tool not present in the role's registry  -> not allowed.
 *  - permission 'AUTO'                          -> allowed, no approval.
 *  - permission 'APPROVAL'                      -> allowed but requiresApproval.
 *  - permission 'HUMAN'                         -> NOT auto-allowed;
 *                                                 must go through the human
 *                                                 approval queue (requiresApproval).
 */
export async function checkToolAccess(
  role: AgentRole,
  tool: ToolName,
  ctx: ToolAccessContext
): Promise<ToolAccessResult> {
  const def = findToolDef(role, tool);

  if (!def) {
    return {
      allowed: false,
      reason: `Role ${role} is not permitted to use tool '${tool}'`,
      requiresApproval: false,
    };
  }

  if (def.permission === 'AUTO') {
    return { allowed: true, requiresApproval: false };
  }

  if (def.permission === 'APPROVAL') {
    return { allowed: true, requiresApproval: true };
  }

  // HUMAN: gated behind a human approval queue; never auto-allowed.
  return {
    allowed: false,
    reason: `Tool '${tool}' requires human approval for role ${role}`,
    requiresApproval: true,
  };
}

/**
 * Record (audit) a tool invocation. Best-effort: never throws.
 *
 * @param role   Agent role that invoked the tool
 * @param tool   Tool name
 * @param ctx    Tenant + user context
 * @param ok     Whether the invocation was permitted/executed
 * @param meta   Optional extra metadata (e.g. tool args summary, latency)
 */
export async function recordToolUse(
  role: AgentRole,
  tool: ToolName,
  ctx: ToolAccessContext,
  ok: boolean,
  meta?: Record<string, unknown>
): Promise<void> {
  const def = findToolDef(role, tool);
  const entry = {
    role,
    tool,
    businessId: ctx.businessId,
    userId: ctx.userId,
    allowed: ok,
    auditLog: def?.auditLog ?? false,
    ts: new Date().toISOString(),
    ...(meta || {}),
  };

  logger.info('ai.tool.used', entry);

  try {
    await emitEvent(
      'ai.tool.used',
      { ...entry },
      { businessId: ctx.businessId, actorId: ctx.userId }
    );
  } catch {
    // best-effort: do not fail the caller if event emission is unavailable
  }
}
