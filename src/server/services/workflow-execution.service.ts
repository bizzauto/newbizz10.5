import { prisma } from '../db.js';
import { EventEmitter } from 'events';
import { isSafeWebhookUrl } from './webhook-retry.service.js';

const workflowEvents = new EventEmitter();
workflowEvents.setMaxListeners(50);

interface WorkflowContext {
  businessId: string;
  workflowId: string;
  executionId: string;
  triggerData: Record<string, any>;
  nodeResults: Record<string, any>;
}

// Execute a single node and return its result
async function executeNode(
  nodeType: string,
  data: any,
  ctx: WorkflowContext,
  previousOutput?: any
): Promise<any> {
  const depth = (ctx.nodeResults as any).__depth || 0;
  if (depth > 5) {
    return { error: 'Max workflow recursion depth reached' };
  }
  (ctx.nodeResults as any).__depth = depth + 1;

  const contact = ctx.triggerData.contact || {};
  const phone = contact.phone || ctx.triggerData.phone || '';
  const email = contact.email || ctx.triggerData.email || '';
  const contactId = contact.id || ctx.triggerData.contactId || '';

  switch (nodeType) {
    case 'send_whatsapp':
    case 'send_message':
    case 'send_email':
    case 'send_sms':
    case 'webhook':
    case 'delay':
    case 'wait':
    case 'add_activity':
    case 'trigger': {
      // §44 slices 3+5/6: all action nodes migrated to workflow/handlers/registry.ts
      const { nodeHandlers } = await import('./workflow/handlers/registry.js');
      const handler = nodeHandlers[nodeType];
      if (!handler) return { error: `No handler for ${nodeType}` };
      return await handler({ contactId, businessId, phone, email, workflowId: ctx.workflowId, executionId: ctx.executionId, nodeType, triggerData: ctx.triggerData, contact, previousOutput, data });
    }

    case 'condition':
    case 'if_else': {
      const field = data.field || 'source';
      const value = data.value || '';
      const operator = data.operator || 'equals';
      const fieldValue = ctx.triggerData[field] || contact[field] || previousOutput?.[field] || '';

      // §44 slice 1: pure evaluator extracted to workflow/condition.evaluator.ts
      const { evaluateCondition } = await import('./workflow/condition.evaluator.js');
      const evaluation = evaluateCondition({ field, value, operator, fieldValue });

      return { ...evaluation, value: evaluation.value };
    }

    default:
      return { executed: true, nodeType, note: 'Unknown node type — simulated' };
  }
}

// Interpolate template variables like {{contact.name}}, {{trigger.message}}
function interpolateTemplate(template: string, vars: any): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    const parts = path.split('.');
    let value: any = vars;
    for (const p of parts) {
      value = value?.[p];
    }
    return value !== undefined && value !== null ? String(value) : `{{${path}}}`;
  });
}

// Execute a workflow (real execution, not simulated)
export async function executeWorkflow(
  businessId: string,
  workflowId: string,
  triggerData: Record<string, any>
): Promise<any> {
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, businessId, isActive: true },
  });

  if (!workflow) throw new Error('Workflow not found or inactive');

  const nodes = workflow.nodes as any[];
  const edges = workflow.edges as any[];
  if (!Array.isArray(nodes) || nodes.length === 0) throw new Error('Workflow has no nodes');

  // Create execution record
  const execution = await prisma.workflowExecution.create({
    data: {
      businessId,
      workflowId,
      status: 'running',
      triggerData,
      nodeResults: {},
    },
  });

  const ctx: WorkflowContext = {
    businessId,
    workflowId,
    executionId: execution.id,
    triggerData,
    nodeResults: {},
  };

  // Build adjacency list
  const adjacencyList: Record<string, string[]> = {};
  for (const edge of edges) {
    const sourceId = edge.source || edge.sourceNodeId;
    const targetId = edge.target || edge.targetNodeId;
    if (sourceId && targetId) {
      if (!adjacencyList[sourceId]) adjacencyList[sourceId] = [];
      adjacencyList[sourceId].push(targetId);
    }
  }

  // Find root nodes
  const targetIds = new Set(edges.map((e: any) => e.target || e.targetNodeId));
  const rootNodes = nodes.filter((n: any) => !targetIds.has(n.id));

  // BFS traversal with real execution
  const queue: string[] = rootNodes.map((n: any) => n.id);
  const visited = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodes.find((n: any) => n.id === nodeId);
    if (!node) continue;

    const nodeType = node.type || node.data?.type || 'unknown';

    try {
      const previousOutput = Object.values(ctx.nodeResults).length > 0
        ? Object.values(ctx.nodeResults)[Object.values(ctx.nodeResults).length - 1]?.output
        : undefined;

      const output = await executeNode(nodeType, node.data || {}, ctx, previousOutput);

      ctx.nodeResults[nodeId] = {
        nodeType,
        label: node.data?.label || node.label || nodeType,
        status: 'completed',
        executedAt: new Date().toISOString(),
        output,
      };

      // Handle condition branching
      if (nodeType === 'condition' || nodeType === 'if_else') {
        const trueEdge = edges.find((e: any) => (e.source === nodeId || e.sourceNodeId === nodeId) && e.sourceHandle === 'true');
        const falseEdge = edges.find((e: any) => (e.source === nodeId || e.sourceNodeId === nodeId) && e.sourceHandle === 'false');

        if (output.result) {
          if (trueEdge) {
            const nextId = trueEdge.target || trueEdge.targetNodeId;
            if (nextId && !visited.has(nextId)) queue.push(nextId);
          }
        } else {
          if (falseEdge) {
            const nextId = falseEdge.target || falseEdge.targetNodeId;
            if (nextId && !visited.has(nextId)) queue.push(nextId);
          }
        }
        continue; // Don't add all children for condition nodes
      }

      // Enqueue children
      const children = adjacencyList[nodeId] || [];
      for (const childId of children) {
        if (!visited.has(childId)) {
          queue.push(childId);
        }
      }
    } catch (err: any) {
      console.error(`[Workflow] Node ${nodeId} (${nodeType}) failed:`, err.message);
      ctx.nodeResults[nodeId] = {
        nodeType,
        label: node.data?.label || nodeType,
        status: 'failed',
        executedAt: new Date().toISOString(),
        output: { error: err.message },
      };
    }
  }

  // Mark unvisited nodes as skipped
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      ctx.nodeResults[node.id] = {
        nodeType: node.type || node.data?.type || 'unknown',
        label: node.data?.label || 'Unknown',
        status: 'skipped',
        executedAt: new Date().toISOString(),
        output: null,
      };
    }
  }

  // Update execution record
  const hasFailures = Object.values(ctx.nodeResults).some((r: any) => r.status === 'failed');
  const completedExecution = await prisma.workflowExecution.update({
    where: { id: execution.id },
    data: {
      status: hasFailures ? 'partial' : 'completed',
      nodeResults: ctx.nodeResults,
      completedAt: new Date(),
    },
  });

  await prisma.workflow.update({
    where: { id: workflowId },
    data: { runCount: { increment: 1 }, lastRunAt: new Date() },
  });

  return completedExecution;
}

// Trigger all matching workflows for a given event
export async function triggerWorkflows(
  businessId: string,
  triggerType: string,
  triggerData: Record<string, any>
): Promise<any[]> {
  const workflows = await prisma.workflow.findMany({
    where: { businessId, triggerType, isActive: true },
  });

  const results: any[] = [];

  for (const workflow of workflows) {
    // Check trigger config conditions
    if (workflow.triggerConfig && typeof workflow.triggerConfig === 'object') {
      const config = workflow.triggerConfig as any;
      let shouldExecute = true;

      if (triggerType === 'message_received' && config.keywords && triggerData.message) {
        const keywords = Array.isArray(config.keywords) ? config.keywords : [config.keywords];
        const messageText = (triggerData.message as string).toLowerCase();
        shouldExecute = keywords.some((kw: string) => messageText.includes(kw.toLowerCase()));
      }

      if (triggerType === 'tag_added' && config.tags && triggerData.tag) {
        const tags = Array.isArray(config.tags) ? config.tags : [config.tags];
        shouldExecute = tags.includes(triggerData.tag);
      }

      if (!shouldExecute) continue;
    }

    try {
      const execution = await executeWorkflow(businessId, workflow.id, triggerData);
      results.push({ workflowId: workflow.id, workflowName: workflow.name, execution });
    } catch (err: any) {
      console.error(`[Workflow] Failed to execute ${workflow.name}:`, err.message);
      results.push({ workflowId: workflow.id, workflowName: workflow.name, error: err.message });
    }
  }

  return results;
}

export { workflowEvents, interpolateTemplate };
