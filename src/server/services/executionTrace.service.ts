import { prisma } from '../db.js';
import logger from '../utils/logger.js';

/**
 * Admin Control Center — Execution Trace service.
 *
 * Reads a business-scoped workflow execution and reconstructs a step-by-step
 * trace from the persisted `nodeResults` JSON payload. Falls back to a single
 * synthetic step derived from the execution's overall status when no detailed
 * node results are available.
 */

export interface ExecutionStep {
  node: string;
  status: string;
  attempt?: number;
  error?: string;
  timestamp?: string;
}

export interface ExecutionTrace {
  executionId: string;
  workflowId: string;
  status: string;
  steps: ExecutionStep[];
  startedAt?: string;
  completedAt?: string;
}

/**
 * Parse the `nodeResults` JSON column into a typed step list.
 * Each entry is expected to be { node, status, error?, attempt? }.
 * Anything that does not match the expected shape is coerced defensively so a
 * malformed payload never 500s.
 */
function parseNodeResults(raw: unknown): ExecutionStep[] {
  if (!raw) return [];

  const list = Array.isArray(raw) ? raw : [];
  const steps: ExecutionStep[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const node = typeof entry.node === 'string' ? entry.node : String(entry.node ?? 'unknown');
    const status = typeof entry.status === 'string' ? entry.status : String(entry.status ?? 'unknown');
    const step: ExecutionStep = { node, status };

    if (typeof entry.attempt === 'number') step.attempt = entry.attempt;
    if (typeof entry.error === 'string') step.error = entry.error;

    if (entry.timestamp instanceof Date) {
      step.timestamp = entry.timestamp.toISOString();
    } else if (typeof entry.timestamp === 'string') {
      step.timestamp = entry.timestamp;
    }

    steps.push(step);
  }

  return steps;
}

/**
 * Read a single workflow execution and build its step trace.
 */
export async function getTrace(
  businessId: string,
  executionId: string
): Promise<ExecutionTrace> {
  const execution = await prisma.workflowExecution.findFirst({
    where: { id: executionId, businessId },
  });

  if (!execution) {
    throw new Error('Workflow execution not found');
  }

  const steps = parseNodeResults(execution.nodeResults);

  // Fall back to a single synthetic step when no detailed results exist.
  if (steps.length === 0) {
    steps.push({
      node: execution.workflowId,
      status: execution.status,
      error: execution.error ?? undefined,
    });
  }

  return {
    executionId: execution.id,
    workflowId: execution.workflowId,
    status: execution.status,
    steps,
    startedAt: execution.startedAt?.toISOString(),
    completedAt: execution.completedAt?.toISOString(),
  };
}

/**
 * List workflow executions for a business, optionally filtered by status.
 */
export async function listExecutions(
  businessId: string,
  filter?: { status?: string; limit?: number }
) {
  const where: Record<string, unknown> = { businessId };
  if (filter?.status) where.status = filter.status;

  const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 200);

  const executions = await prisma.workflowExecution.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    take: limit,
  });

  return executions.map((e) => ({
    id: e.id,
    workflowId: e.workflowId,
    status: e.status,
    error: e.error ?? undefined,
    startedAt: e.startedAt?.toISOString(),
    completedAt: e.completedAt?.toISOString(),
  }));
}

export default { getTrace, listExecutions };
