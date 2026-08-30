import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

interface FlowNodeInput {
  id: string;
  type: 'message' | 'question' | 'condition' | 'delay' | 'tag' | 'handoff' | 'jump';
  data: Record<string, any>;
  position?: { x: number; y: number };
}

function sanitizeGraph(input: any): { nodes: FlowNodeInput[]; edges: any[] } {
  const nodes: FlowNodeInput[] = Array.isArray(input?.nodes)
    ? input.nodes
        .filter((n: any) => n && typeof n.id === 'string' && typeof n.type === 'string')
        .slice(0, 50)
        .map((n: any) => ({
          id: n.id,
          type: n.type,
          data: typeof n.data === 'object' && n.data ? n.data : {},
          position: n.position && typeof n.position.x === 'number' ? { x: n.position.x, y: n.position.y } : undefined,
        }))
    : [];
  const edges: any[] = Array.isArray(input?.edges)
    ? input.edges
        .filter((e: any) => e && typeof e.source === 'string' && typeof e.target === 'string')
        .slice(0, 100)
        .map((e: any, i: number) => ({ id: e.id || `e_${i}`, source: e.source, target: e.target, sourceHandle: e.sourceHandle }))
    : [];
  return { nodes, edges };
}

// List flows with session stats
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    const flows = await prisma.whatsAppFlow.findMany({
      where: { businessId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { sessions: true } } },
    });

    const activeSessions = await prisma.whatsAppFlowSession.groupBy({
      by: ['flowId'],
      where: { businessId, status: 'active' },
      _count: true,
    });
    const activeMap = new Map(activeSessions.map((s) => [s.flowId, s._count]));

    res.json({
      success: true,
      data: flows.map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        trigger: f.trigger,
        isActive: f.isActive,
        reentryHours: f.reentryHours,
        priority: f.priority,
        runCount: f.runCount,
        lastRunAt: f.lastRunAt,
        totalSessions: f._count.sessions,
        activeSessions: activeMap.get(f.id) || 0,
        nodeCount: ((f.graph as any)?.nodes || []).length,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single flow with full graph
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const flow = await prisma.whatsAppFlow.findFirst({
      where: { id: req.params.id, businessId: req.user?.businessId },
    });
    if (!flow) return res.status(404).json({ success: false, error: 'Flow not found' });
    res.json({ success: true, data: flow });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create flow
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    const { name, description, trigger, graph, reentryHours, priority } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const flow = await prisma.whatsAppFlow.create({
      data: {
        businessId,
        name: name.slice(0, 100),
        description: description ? String(description).slice(0, 500) : null,
        trigger: (typeof trigger === 'object' && trigger ? trigger : { type: 'keyword', keyword: '', matchType: 'contains' }) as any,
        graph: sanitizeGraph(graph) as any,
        reentryHours: Number.isFinite(Number(reentryHours)) ? Math.min(720, Math.max(0, Number(reentryHours))) : 24,
        priority: Number.isFinite(Number(priority)) ? Math.min(100, Math.max(0, Number(priority))) : 0,
        createdBy: req.user?.id,
      },
    });
    res.json({ success: true, data: flow });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update flow
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.whatsAppFlow.findFirst({
      where: { id: req.params.id, businessId: req.user?.businessId },
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Flow not found' });

    const { name, description, trigger, graph, reentryHours, priority, isActive } = req.body ?? {};
    const flow = await prisma.whatsAppFlow.update({
      where: { id: existing.id },
      data: {
        ...(name ? { name: String(name).slice(0, 100) } : {}),
        ...(description !== undefined ? { description: description ? String(description).slice(0, 500) : null } : {}),
        ...(trigger !== undefined ? { trigger: trigger as any } : {}),
        ...(graph !== undefined ? { graph: sanitizeGraph(graph) as any } : {}),
        ...(reentryHours !== undefined ? { reentryHours: Math.min(720, Math.max(0, Number(reentryHours) || 0)) } : {}),
        ...(priority !== undefined ? { priority: Math.min(100, Math.max(0, Number(priority) || 0)) } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });
    res.json({ success: true, data: flow });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Toggle active
router.post('/:id/toggle', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.whatsAppFlow.findFirst({
      where: { id: req.params.id, businessId: req.user?.businessId },
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Flow not found' });

    const flow = await prisma.whatsAppFlow.update({
      where: { id: existing.id },
      data: { isActive: !existing.isActive },
    });
    res.json({ success: true, data: { id: flow.id, isActive: flow.isActive } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Recent sessions for a flow
router.get('/:id/sessions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await prisma.whatsAppFlowSession.findMany({
      where: { flowId: req.params.id, businessId: req.user?.businessId },
      include: { contact: { select: { name: true, phone: true } } },
      orderBy: { lastActivity: 'desc' },
      take: 50,
    });
    res.json({ success: true, data: sessions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete flow
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.whatsAppFlow.findFirst({
      where: { id: req.params.id, businessId: req.user?.businessId },
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Flow not found' });

    await prisma.whatsAppFlowSession.deleteMany({ where: { flowId: existing.id } });
    await prisma.whatsAppFlow.delete({ where: { id: existing.id } });
    res.json({ success: true, message: 'Flow deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
