import { prisma } from '../db.js';
import { createRedisConnection } from '../utils/redis-connection.js';

const STREAM = 'bizz:events';
const eventConn = createRedisConnection();

export interface EmitOptions {
  businessId?: string | null;
  actorId?: string;
  idempotencyKey?: string;
}

/**
 * Publishes a domain event to the Redis stream (for n8n / real-time consumers)
 * and persists an immutable audit record in the DomainEvent table.
 * Both steps are best-effort and never throw to the caller.
 */
export async function emitEvent(
  type: string,
  payload: Record<string, unknown>,
  opts: EmitOptions = {}
): Promise<void> {
  const idempotencyKey =
    opts.idempotencyKey || `${type}:${JSON.stringify(payload).slice(0, 64)}:${Date.now()}`;

  if (eventConn) {
    try {
      await eventConn.xadd(
        STREAM,
        '*',
        'type', type,
        'businessId', opts.businessId || '',
        'actorId', opts.actorId || '',
        'payload', JSON.stringify(payload)
      );
    } catch (err) {
      console.error('[EventBus] stream publish failed:', err);
    }
  }

  try {
    await prisma.domainEvent.create({
      data: {
        eventType: type,
        businessId: opts.businessId || null,
        payload: payload as any,
        idempotencyKey,
        status: 'processed',
      },
    });
  } catch (err) {
    console.error('[EventBus] domainEvent persist failed:', err);
  }
}

export function getEventStreamName(): string {
  return STREAM;
}

export default { emitEvent, getEventStreamName };
