/**
 * No-Code + Natural-Language Automation Builder — core service.
 *
 * Persists automation specifications as Workflow rows and validates them
 * against the known trigger/step grammar. This is the storage/validation
 * layer consumed by the route handlers and the NL service.
 */
import { prisma } from '../db.js';
import { emitEvent } from '../events/eventBus.js';
import logger from '../utils/logger.js';

export type TriggerType =
  | 'lead.created'
  | 'lead.scored'
  | 'deal.stage_changed'
  | 'message.received'
  | 'form.submitted'
  | 'payment.success'
  | 'schedule.cron'
  | 'webhook.received';

export type ActionType =
  | 'create_contact'
  | 'add_tag'
  | 'assign_salesperson'
  | 'send_whatsapp'
  | 'send_email'
  | 'create_task'
  | 'create_deal'
  | 'notify_manager'
  | 'create_campaign';

export interface AutomationStep {
  id: string;
  type: 'trigger' | 'condition' | 'action' | 'wait' | 'branch' | 'end';
  config: Record<string, any>;
}

export interface AutomationSpec {
  id?: string;
  name: string;
  businessId: string;
  trigger: TriggerType;
  steps: AutomationStep[];
  enabled?: boolean;
}

const KNOWN_TRIGGERS: TriggerType[] = [
  'lead.created',
  'lead.scored',
  'deal.stage_changed',
  'message.received',
  'form.submitted',
  'payment.success',
  'schedule.cron',
  'webhook.received',
];

const KNOWN_STEP_TYPES = ['trigger', 'condition', 'action', 'wait', 'branch', 'end'] as const;

const KNOWN_ACTION_TYPES: ActionType[] = [
  'create_contact',
  'add_tag',
  'assign_salesperson',
  'send_whatsapp',
  'send_email',
  'create_task',
  'create_deal',
  'notify_manager',
  'create_campaign',
];

/**
 * Validate an AutomationSpec for structural correctness.
 * - trigger must be a known value
 * - every step must use a known step type
 * - every step id must be unique
 * - branch/condition steps that reference another step via config.next/target
 *   must point at an existing step id
 */
export async function validateSpec(spec: AutomationSpec): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (!spec || typeof spec !== 'object') {
    return { valid: false, errors: ['spec must be an object'] };
  }

  if (!spec.name || typeof spec.name !== 'string' || spec.name.trim().length === 0) {
    errors.push('name is required');
  }

  if (!spec.businessId || typeof spec.businessId !== 'string') {
    errors.push('businessId is required');
  }

  if (!KNOWN_TRIGGERS.includes(spec.trigger)) {
    errors.push(`trigger "${spec.trigger}" is not a known trigger type`);
  }

  if (!Array.isArray(spec.steps) || spec.steps.length === 0) {
    errors.push('steps must be a non-empty array');
  } else {
    const ids = new Set<string>();

    for (const step of spec.steps) {
      if (!step || typeof step !== 'object') {
        errors.push('each step must be an object');
        continue;
      }

      if (!step.id || typeof step.id !== 'string') {
        errors.push('each step must have a string id');
        continue;
      }

      if (ids.has(step.id)) {
        errors.push(`duplicate step id "${step.id}"`);
      }
      ids.add(step.id);

      if (!(KNOWN_STEP_TYPES as readonly string[]).includes(step.type)) {
        errors.push(`step "${step.id}" has unknown type "${step.type}"`);
      }

      if (step.type === 'action' && step.config && step.config.action) {
        if (!KNOWN_ACTION_TYPES.includes(step.config.action)) {
          errors.push(`step "${step.id}" has unknown action "${step.config.action}"`);
        }
      }

      if (step.type === 'condition' || step.type === 'branch') {
        const ref = step.config?.next ?? step.config?.target;
        if (ref && typeof ref === 'string' && !ids.has(ref) && !spec.steps.some((s: AutomationStep) => s.id === ref)) {
          errors.push(`step "${step.id}" references unknown step "${ref}"`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Serialize an AutomationSpec into the persistence shape used by the real
 * Prisma Workflow model (triggerType / isActive / nodes / triggerConfig).
 */
function specToWorkflowData(spec: AutomationSpec, createdBy?: string) {
  return {
    businessId: spec.businessId,
    name: spec.name,
    triggerType: spec.trigger,
    isActive: spec.enabled ?? false,
    triggerConfig: {},
    nodes: spec.steps as any,
    createdBy: createdBy || undefined,
  };
}

/**
 * Rehydrate a Workflow row into an AutomationSpec.
 */
function workflowToSpec(w: any): AutomationSpec {
  let steps: AutomationStep[] = [];
  if (Array.isArray(w.nodes)) {
    steps = w.nodes;
  } else if (typeof w.nodes === 'string') {
    try {
      const parsed = JSON.parse(w.nodes);
      if (Array.isArray(parsed)) steps = parsed;
    } catch {
      steps = [];
    }
  }
  return {
    id: w.id,
    name: w.name,
    businessId: w.businessId,
    trigger: w.triggerType,
    steps,
    enabled: w.isActive,
  };
}

/**
 * Persist an AutomationSpec as a Workflow row and emit automation.created.
 */
export async function createAutomation(spec: AutomationSpec): Promise<AutomationSpec> {
  const { valid, errors } = await validateSpec(spec);
  if (!valid) {
    throw new Error(`Invalid automation spec: ${errors.join('; ')}`);
  }

  const created = await prisma.workflow.create({
    data: specToWorkflowData(spec),
  });

  try {
    await emitEvent(
      'automation.created',
      {
        id: created.id,
        name: created.name,
        trigger: created.triggerType,
        stepCount: spec.steps.length,
      },
      { businessId: spec.businessId }
    );
  } catch (err) {
    logger.warn('automation.created event emit failed', { error: (err as Error)?.message });
  }

  return workflowToSpec(created);
}

export async function listAutomations(businessId: string): Promise<AutomationSpec[]> {
  const rows = await prisma.workflow.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(workflowToSpec);
}

export async function getAutomation(id: string): Promise<AutomationSpec | null> {
  const row = await prisma.workflow.findUnique({ where: { id } });
  return row ? workflowToSpec(row) : null;
}

export async function setActive(id: string, active: boolean): Promise<AutomationSpec | null> {
  const existing = await prisma.workflow.findUnique({ where: { id } });
  if (!existing) return null;

  const updated = await prisma.workflow.update({
    where: { id },
    data: { isActive: active },
  });
  return workflowToSpec(updated);
}
