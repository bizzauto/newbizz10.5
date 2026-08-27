/**
 * Type definitions for AI Tool Permissions and Guardrails.
 *
 * These types describe the agent roles, the tools they may invoke, and the
 * permission/audit metadata used to gate AI-driven automation in BIZZ CRM.
 */

/** Agent roles that can invoke AI tools. */
export type AgentRole =
  | 'SALES'
  | 'SUPPORT'
  | 'MARKETING'
  | 'REVIEW'
  | 'ANALYTICS'
  | 'CUSTOMER_SUCCESS'
  | 'MANAGER';

/** The finite set of tools an agent may be granted access to. */
export type ToolName =
  | 'get_contact'
  | 'get_lead'
  | 'score_lead'
  | 'create_task'
  | 'send_whatsapp'
  | 'update_deal'
  | 'generate_content'
  | 'generate_image'
  | 'create_campaign'
  | 'publish_post'
  | 'get_customer'
  | 'get_conversation'
  | 'create_ticket'
  | 'draft_reply';

/**
 * Tool definition describing how an agent may use a tool.
 *
 * - permission: 'AUTO' = agent may call directly; 'APPROVAL' = soft approval
 *   (allowed but requires an approval record); 'HUMAN' = requires a human in
 *   the loop via the approval queue (never auto-allowed).
 * - tenantScoped: whether the tool's data is scoped to the agent's businessId.
 * - rateLimitKey: optional Redis key fragment for per-tool rate limiting.
 * - approvalRule: optional rule id describing the approval policy.
 * - auditLog: whether every invocation is written to the audit trail.
 */
export interface ToolDef {
  name: ToolName;
  permission: 'AUTO' | 'APPROVAL' | 'HUMAN';
  tenantScoped: boolean;
  rateLimitKey?: string;
  approvalRule?: string;
  auditLog: boolean;
  description: string;
}
