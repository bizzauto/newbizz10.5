/**
 * WhatsApp Flow Builder Engine
 *
 * Executes multi-step conversational flows for WhatsApp (Evolution + Meta).
 * Flow graph structure (stored in WhatsAppFlow.graph):
 *   {
 *     nodes: [{ id, type, data, position? }],
 *     edges: [{ id, source, target, sourceHandle? }]
 *   }
 *
 * Node types:
 *   message   — send text (spintax + {name} personalization, anti-ban delay)
 *   question  — send prompt, capture next user reply into a variable
 *   condition — branch on keyword match → sourceHandle 'yes' | 'no'
 *   delay     — wait N seconds
 *   tag       — add CRM tag(s) to contact
 *   handoff   — mark session handed_off, notify via activity log
 *   jump      — continue at another node
 *
 * Entry: handleIncomingForFlows(businessId, contactId, phone, text)
 * Called from the WhatsApp webhook before AI auto-reply, so flows win.
 */
import { prisma } from '../db.js';
import { EvolutionApiService } from './evolution.service.js';
import { spinAndPersonalize } from '../utils/spintax.js';

interface FlowNode {
  id: string;
  type: 'message' | 'question' | 'condition' | 'delay' | 'tag' | 'handoff' | 'jump';
  data: {
    text?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'document' | 'audio';
    saveAs?: string;          // question: variable name
    variable?: string;        // condition: variable to test
    operator?: 'contains' | 'equals' | 'not_empty';
    value?: string;           // condition: compare value
    seconds?: number;         // delay
    tags?: string[];          // tag
    targetNodeId?: string;    // jump
    notes?: string;           // handoff
  };
  position?: { x: number; y: number };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string; // condition nodes: 'yes' | 'no'
}

interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

const MAX_STEPS_PER_MESSAGE = 25; // guard against infinite loops
const SESSION_IDLE_HOURS = 12;    // session expires after this much inactivity

function nextEdge(graph: FlowGraph, fromNodeId: string, handle?: string): FlowEdge | undefined {
  const candidates = graph.edges.filter((e) => e.source === fromNodeId);
  if (handle) return candidates.find((e) => e.sourceHandle === handle) ?? candidates[0];
  return candidates[0];
}

async function sendText(businessId: string, to: string, template: string, vars: Record<string, any>): Promise<void> {
  const rendered = spinAndPersonalize(template, { name: vars.name || null, phone: to, business: vars.business || null });
  try {
    await EvolutionApiService.sendText(businessId, to, rendered, { applyAntiBan: true });
  } catch (err: any) {
    console.error('[FlowEngine] sendText failed:', err?.message);
  }
}

async function sendMedia(businessId: string, to: string, node: FlowNode, vars: Record<string, any>): Promise<void> {
  const caption = node.data.text ? spinAndPersonalize(node.data.text, { name: vars.name || null, phone: to }) : undefined;
  try {
    await EvolutionApiService.sendMedia(businessId, to, node.data.mediaUrl || '', node.data.mediaType || 'image', caption, { applyAntiBan: true });
  } catch (err: any) {
    console.error('[FlowEngine] sendMedia failed:', err?.message);
  }
}

function evalCondition(node: FlowNode, vars: Record<string, any>, incomingText: string): boolean {
  const { variable, operator = 'contains', value = '' } = node.data;
  const subject = variable === '__message__' ? incomingText : String(vars[variable || ''] ?? '');
  switch (operator) {
    case 'equals': return subject.trim().toLowerCase() === value.trim().toLowerCase();
    case 'not_empty': return subject.trim().length > 0;
    case 'contains':
    default: return subject.toLowerCase().includes(value.trim().toLowerCase());
  }
}

async function runFromNode(
  flow: { id: string; graph: unknown },
  startNodeId: string | undefined,
  ctx: { businessId: string; contactId: string; phone: string; incomingText: string },
  sessionVars: Record<string, any>,
  sessionUpdater: { setCurrent: (nodeId: string | null) => Promise<void>; saveVars: () => Promise<void>; complete: () => Promise<void> }
): Promise<void> {
  const graph = flow.graph as unknown as FlowGraph;
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  let currentId = startNodeId;
  let steps = 0;

  while (currentId && steps < MAX_STEPS_PER_MESSAGE) {
    steps++;
    const node = nodeMap.get(currentId);
    if (!node) break;

    switch (node.type) {
      case 'message': {
        if (node.data.mediaUrl) await sendMedia(ctx.businessId, ctx.phone, node, sessionVars);
        else if (node.data.text) await sendText(ctx.businessId, ctx.phone, node.data.text, sessionVars);
        currentId = nextEdge(graph, node.id)?.target;
        break;
      }

      case 'question': {
        if (node.data.text) await sendText(ctx.businessId, ctx.phone, node.data.text, sessionVars);
        // Pause — next user reply answers this question
        await sessionUpdater.setCurrent(node.id);
        return;
      }

      case 'condition': {
        const pass = evalCondition(node, sessionVars, ctx.incomingText);
        const edge = nextEdge(graph, node.id, pass ? 'yes' : 'no');
        currentId = edge?.target;
        break;
      }

      case 'delay': {
        const secs = Math.min(300, Math.max(0, node.data.seconds ?? 3));
        await new Promise((r) => setTimeout(r, secs * 1000));
        currentId = nextEdge(graph, node.id)?.target;
        break;
      }

      case 'tag': {
        const tags = (node.data.tags || []).filter(Boolean);
        if (tags.length) {
          await prisma.contact.update({
            where: { id: ctx.contactId },
            data: { tags: { push: tags } },
          }).catch(() => {});
          Object.assign(sessionVars, { tags: [...(sessionVars.tags || []), ...tags] });
        }
        currentId = nextEdge(graph, node.id)?.target;
        break;
      }

      case 'handoff': {
        await prisma.activity.create({
          data: {
            businessId: ctx.businessId,
            contactId: ctx.contactId,
            type: 'flow_handoff',
            title: 'Flow handed off to human',
            content: node.data.notes || 'User requested human assistance',
            createdBy: 'flow-engine',
          },
        }).catch(() => {});
        await sessionUpdater.setCurrent(null);
        await prisma.whatsAppFlowSession.updateMany({
          where: { flowId: flow.id, contactId: ctx.contactId, status: 'active' },
          data: { status: 'handed_off' },
        });
        return;
      }

      case 'jump': {
        currentId = node.data.targetNodeId && nodeMap.has(node.data.targetNodeId) ? node.data.targetNodeId : undefined;
        break;
      }

      default:
        currentId = nextEdge(graph, node.id)?.target;
    }
  }

  if (steps >= MAX_STEPS_PER_MESSAGE) {
    console.warn(`[FlowEngine] ${flow.id}: hit step cap — possible loop`);
  }

  // Ran off the end of the graph → flow complete
  await sessionUpdater.complete();
}

/**
 * Main entry — call on every inbound WhatsApp message BEFORE AI auto-reply.
 * Returns true if a flow handled the message (skip AI auto-reply).
 */
export async function handleIncomingForFlows(
  businessId: string,
  contactId: string,
  phone: string,
  incomingText: string
): Promise<boolean> {
  try {
    // 1. Active session for this contact? Continue that flow.
    const activeSession = await prisma.whatsAppFlowSession.findFirst({
      where: { businessId, contactId, status: 'active' },
      include: { flow: true },
      orderBy: { lastActivity: 'desc' },
    });

    if (activeSession) {
      const flow = activeSession.flow;
      const graph = flow.graph as unknown as FlowGraph;

      // Idle expiry
      const idleMs = Date.now() - new Date(activeSession.lastActivity).getTime();
      if (idleMs > SESSION_IDLE_HOURS * 3600_000) {
        await prisma.whatsAppFlowSession.update({ where: { id: activeSession.id }, data: { status: 'abandoned' } });
      } else {
        const vars = (activeSession.variables as Record<string, any>) || {};
        const waitingNode = graph.nodes.find((n) => n.id === activeSession.currentNodeId);

        // If paused on a question, capture the answer into a variable
        if (waitingNode?.type === 'question' && waitingNode.data.saveAs) {
          vars[waitingNode.data.saveAs] = incomingText.trim();
        }

        const sessionUpdater = {
          setCurrent: async (nodeId: string | null) => {
            await prisma.whatsAppFlowSession.update({
              where: { id: activeSession.id },
              data: { currentNodeId: nodeId, variables: vars, lastActivity: new Date() },
            });
          },
          saveVars: async () => {
            await prisma.whatsAppFlowSession.update({
              where: { id: activeSession.id },
              data: { variables: vars, lastActivity: new Date() },
            });
          },
          complete: async () => {
            await prisma.whatsAppFlowSession.update({
              where: { id: activeSession.id },
              data: { status: 'completed', currentNodeId: null, completedAt: new Date() },
            });
          },
        };

        // Resume AFTER the question node (question already consumed the reply)
        let resumeId: string | undefined;
        if (waitingNode?.type === 'question') {
          const edge = nextEdge(graph, waitingNode.id);
          resumeId = edge?.target;
          await sessionUpdater.saveVars();
        } else {
          resumeId = activeSession.currentNodeId ?? undefined;
        }

        await runFromNode(flow, resumeId, { businessId, contactId, phone, incomingText }, vars, sessionUpdater);
        return true; // flow owns this contact — skip other bots
      }
    }

    // 2. No active session — try to trigger a new flow
    const flows = await prisma.whatsAppFlow.findMany({
      where: { businessId, isActive: true },
      orderBy: { priority: 'desc' },
      take: 20,
    });
    if (flows.length === 0) return false;

    const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { createdAt: true } });
    const isNewContact = contact ? Date.now() - new Date(contact.createdAt).getTime() < 10 * 60_000 : false;

    for (const flow of flows) {
      const trigger = (flow.trigger as any) || {};
      let matched = false;

      if (trigger.type === 'keyword' && trigger.keyword) {
        const kw = String(trigger.keyword).toLowerCase();
        matched = trigger.matchType === 'exact'
          ? incomingText.trim().toLowerCase() === kw
          : incomingText.toLowerCase().includes(kw);
      } else if (trigger.type === 'first_message') {
        matched = isNewContact;
      } else if (trigger.type === 'any_message') {
        matched = true;
      }

      if (!matched) continue;

      // Re-entry guard
      const prior = await prisma.whatsAppFlowSession.findUnique({
        where: { flowId_contactId: { flowId: flow.id, contactId } },
      });
      if (prior) {
        const sinceMs = Date.now() - new Date(prior.lastActivity).getTime();
        if (sinceMs < (flow.reentryHours || 24) * 3600_000) continue; // too soon
        // Re-enter: reset the session
        await prisma.whatsAppFlowSession.delete({ where: { id: prior.id } }).catch(() => {});
      }

      // Start the flow
      const startNode = (flow.graph as unknown as FlowGraph).nodes[0];
      if (!startNode) continue;

      const session = await prisma.whatsAppFlowSession.create({
        data: {
          flowId: flow.id,
          contactId,
          businessId,
          variables: {},
          status: 'active',
        },
      });

      const sessionUpdater = {
        setCurrent: async (nodeId: string | null) => {
          await prisma.whatsAppFlowSession.update({
            where: { id: session.id },
            data: { currentNodeId: nodeId, lastActivity: new Date() },
          });
        },
        saveVars: async () => {
          await prisma.whatsAppFlowSession.update({
            where: { id: session.id },
            data: { lastActivity: new Date() },
          });
        },
        complete: async () => {
          await prisma.whatsAppFlowSession.update({
            where: { id: session.id },
            data: { status: 'completed', currentNodeId: null, completedAt: new Date() },
          });
        },
      };

      await prisma.whatsAppFlow.update({
        where: { id: flow.id },
        data: { runCount: { increment: 1 }, lastRunAt: new Date() },
      });

      await runFromNode(flow, startNode.id, { businessId, contactId, phone, incomingText }, {}, sessionUpdater);
      return true;
    }

    return false;
  } catch (err: any) {
    console.error('[FlowEngine] handleIncomingForFlows failed:', err?.message);
    return false; // never block the webhook
  }
}
